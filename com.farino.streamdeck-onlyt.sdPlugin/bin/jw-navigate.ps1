param([string]$Target)

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

Add-Type -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
'@ -Name Win32 -Namespace UI

$proc = Get-Process -Name "JWLibrary" -ErrorAction SilentlyContinue
if (-not $proc) { Write-Output "NOT_RUNNING"; exit 1 }

# UWP windows are owned by ApplicationFrameHost, not JWLibrary.exe.
# Find the window by its title instead of process ID.
$root = [System.Windows.Automation.AutomationElement]::RootElement
$nameCond = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::NameProperty, "JW Library")
$appWin = $root.FindFirst("Children", $nameCond)

if (-not $appWin) { Write-Output "WINDOW_NOT_FOUND"; exit 2 }

# Bring to foreground
$hwnd = $appWin.Current.NativeWindowHandle
[UI.Win32]::ShowWindow([IntPtr]$hwnd, 9) | Out-Null
[UI.Win32]::SetForegroundWindow([IntPtr]$hwnd) | Out-Null
Start-Sleep -Milliseconds 300

# Helper: find an invokable ListItem by name (skips Text and Group matches)
function Invoke-ListItem($window, [string]$itemName) {
    $nameCond = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::NameProperty, $itemName)
    $typeCond = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
        [System.Windows.Automation.ControlType]::ListItem)
    $andCond = New-Object System.Windows.Automation.AndCondition($nameCond, $typeCond)
    $el = $window.FindFirst("Descendants", $andCond)
    if (-not $el) { return $false }
    try {
        $el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
        return $true
    } catch {
        return $false
    }
}

switch ($Target) {
    "PersonalStudy" {
        $ok = Invoke-ListItem $appWin "Personal Study"
        if (-not $ok) { Write-Output "CONTROL_NOT_FOUND:Personal Study"; exit 3 }
    }
    "Meetings" {
        $ok = Invoke-ListItem $appWin "Meetings"
        if (-not $ok) { Write-Output "CONTROL_NOT_FOUND:Meetings"; exit 3 }
    }
    default { Write-Output "UNKNOWN_TARGET"; exit 4 }
}
Write-Output "OK"
