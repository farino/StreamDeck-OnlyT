<#
  Meeting Timer for OnlyT - OnlyT main window lock helper.

  Modes:
    List    Print the connected monitors as JSON.
    Lock    Run until stopped. Locks the OnlyT main window so the user can
            neither resize, move nor minimise it:
              - removes the resize/maximise/minimise styles and the
                Move/Size/Minimize/Maximize system-menu commands (no title-bar
                drag, no Alt+Space move, no minimise button);
              - restores the window if something minimises it anyway;
              - remembers the position the window has when the lock starts
                (the admin's chosen spot) and snaps it back if anything moves it;
              - optionally keeps it inside one monitor.
            OnlyT can still resize itself (e.g. Settings page); only the
            top-left position is held.
    Unlock  Give the window its normal resize/move behaviour back, then exit.

  Only the OnlyT control window is touched ("OnlyT Timer Output" is ignored).
  Nothing is downloaded or executed from the network.
#>
param(
	[Parameter(Mandatory = $true)][ValidateSet('List', 'Lock', 'Unlock')][string]$Mode,
	[string]$Monitor = '',
	[int]$ParentPid = 0
)

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class OnlyTWin
{
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left, Top, Right, Bottom; }

    [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongW")] public static extern int GetWindowLong(IntPtr hWnd, int nIndex);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongW")] public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int cmd);
    [DllImport("user32.dll")] public static extern IntPtr GetSystemMenu(IntPtr hWnd, bool revert);
    [DllImport("user32.dll")] public static extern bool DeleteMenu(IntPtr hMenu, uint item, uint flags);
}
'@

# Report real pixel coordinates on mixed-DPI setups (PER_MONITOR_AWARE_V2).
try { [void][OnlyTWin]::SetProcessDpiAwarenessContext([IntPtr]::new(-4)) } catch { }

Add-Type -AssemblyName System.Windows.Forms

$GWL_STYLE = -16
$WS_THICKFRAME = 0x00040000
$WS_MAXIMIZEBOX = 0x00010000
$WS_MINIMIZEBOX = 0x00020000
$LOCK_MASK = $WS_THICKFRAME -bor $WS_MAXIMIZEBOX -bor $WS_MINIMIZEBOX
# NOMOVE | NOSIZE | NOZORDER | NOACTIVATE | FRAMECHANGED
$SWP_STYLE_REFRESH = 0x0001 -bor 0x0002 -bor 0x0004 -bor 0x0010 -bor 0x0020
# NOZORDER | NOACTIVATE
$SWP_MOVE_SIZE = 0x0004 -bor 0x0010
$SWP_NOSIZE = 0x0001
# System-menu commands that let the user resize, move or maximise a window.
$SC_SIZE = 0xF000
$SC_MOVE = 0xF010
$SC_MINIMIZE = 0xF020
$SC_MAXIMIZE = 0xF030

# Position each OnlyT window had when the lock started (the admin's chosen spot).
$anchors = @{}

function Get-OnlyTMainWindows {
	$handles = @()
	foreach ($p in @(Get-Process -Name 'OnlyT' -ErrorAction SilentlyContinue)) {
		try {
			$p.Refresh()
			if ($p.MainWindowHandle -ne [IntPtr]::Zero -and $p.MainWindowTitle -notlike '*Timer Output*') {
				$handles += $p.MainWindowHandle
			}
		} catch { }
	}
	return $handles
}

function Set-ResizeLock([IntPtr]$hwnd, [bool]$locked) {
	$style = [OnlyTWin]::GetWindowLong($hwnd, $GWL_STYLE)
	if ($locked) { $new = $style -band (-bnot $LOCK_MASK) } else { $new = $style -bor $LOCK_MASK }
	if ($new -ne $style) {
		[void][OnlyTWin]::SetWindowLong($hwnd, $GWL_STYLE, $new)
		[void][OnlyTWin]::SetWindowPos($hwnd, [IntPtr]::Zero, 0, 0, 0, 0, $SWP_STYLE_REFRESH)
	}
}

function Set-MoveLock([IntPtr]$hwnd, [bool]$locked) {
	if ($locked) {
		# Deleting Move/Size from the system menu stops title-bar dragging and Alt+Space moving.
		$menu = [OnlyTWin]::GetSystemMenu($hwnd, $false)
		if ($menu -ne [IntPtr]::Zero) {
			foreach ($cmd in @($SC_SIZE, $SC_MOVE, $SC_MINIMIZE, $SC_MAXIMIZE)) {
				[void][OnlyTWin]::DeleteMenu($menu, [uint32]$cmd, 0)
			}
		}
	} else {
		# Revert to the default system menu (restores Move/Size/Maximize).
		[void][OnlyTWin]::GetSystemMenu($hwnd, $true)
	}
}

function Get-TargetScreen([string]$deviceName) {
	if (-not $deviceName) { return $null }
	return [System.Windows.Forms.Screen]::AllScreens | Where-Object { $_.DeviceName -eq $deviceName } | Select-Object -First 1
}

# Hold the window at its anchored position (kept inside $screen when one is chosen).
function Update-WindowPosition([IntPtr]$hwnd, $screen) {
	# Backstop for Win+D, Win+M, taskbar clicks etc.: bring a minimised/maximised window back (SW_RESTORE).
	if ([OnlyTWin]::IsIconic($hwnd) -or [OnlyTWin]::IsZoomed($hwnd)) {
		[void][OnlyTWin]::ShowWindow($hwnd, 9)
	}

	$r = New-Object OnlyTWin+RECT
	if (-not [OnlyTWin]::GetWindowRect($hwnd, [ref]$r)) { return }

	$curW = $r.Right - $r.Left
	$curH = $r.Bottom - $r.Top
	$w = $curW
	$h = $curH

	$key = $hwnd.ToInt64()
	$first = -not $anchors.ContainsKey($key)
	if ($first) { $anchors[$key] = @{ X = $r.Left; Y = $r.Top } }

	$x = $anchors[$key].X
	$y = $anchors[$key].Y

	if ($null -ne $screen) {
		$wa = $screen.WorkingArea
		$w = [Math]::Min($curW, $wa.Width)
		$h = [Math]::Min($curH, $wa.Height)
		$x = [Math]::Max($wa.Left, [Math]::Min($x, $wa.Right - $w))
		$y = [Math]::Max($wa.Top, [Math]::Min($y, $wa.Bottom - $h))
		# The first sighting defines the anchor, so store it already inside the monitor.
		if ($first) { $anchors[$key] = @{ X = $x; Y = $y } }
	}

	if ($x -ne $r.Left -or $y -ne $r.Top -or $w -ne $curW -or $h -ne $curH) {
		$flags = $SWP_MOVE_SIZE
		if ($w -eq $curW -and $h -eq $curH) { $flags = $flags -bor $SWP_NOSIZE }
		[void][OnlyTWin]::SetWindowPos($hwnd, [IntPtr]::Zero, $x, $y, $w, $h, $flags)
	}
}

function Unlock-AllWindows {
	foreach ($hwnd in Get-OnlyTMainWindows) {
		Set-ResizeLock $hwnd $false
		Set-MoveLock $hwnd $false
	}
}

switch ($Mode) {
	'List' {
		$items = @()
		foreach ($s in [System.Windows.Forms.Screen]::AllScreens) {
			$number = ($s.DeviceName -replace '[^0-9]', '')
			$label = "Display $number - $($s.Bounds.Width)x$($s.Bounds.Height)"
			if ($s.Primary) { $label += ' (Primary)' }
			$items += [pscustomobject]@{ deviceName = $s.DeviceName; label = $label; primary = [bool]$s.Primary }
		}
		ConvertTo-Json -InputObject @($items) -Compress
	}

	'Unlock' {
		Unlock-AllWindows
	}

	'Lock' {
		while ($true) {
			if ($ParentPid -gt 0 -and -not (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) { break }

			$screen = Get-TargetScreen $Monitor
			foreach ($hwnd in Get-OnlyTMainWindows) {
				Set-ResizeLock $hwnd $true
				Set-MoveLock $hwnd $true
				Update-WindowPosition $hwnd $screen
			}
			Start-Sleep -Milliseconds 200
		}

		# Plugin/Stream Deck went away: give the user their normal window back.
		Unlock-AllWindows
	}
}
