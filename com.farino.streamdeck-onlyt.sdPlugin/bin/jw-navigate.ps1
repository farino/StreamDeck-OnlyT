param([string]$Target)

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

Add-Type -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
'@ -Name Win32 -Namespace UI

$proc = Get-Process -Name "JWLibrary" -ErrorAction SilentlyContinue
if (-not $proc) { Write-Output "NOT_RUNNING"; exit 1 }

$root = [System.Windows.Automation.AutomationElement]::RootElement
$pid_cond = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ProcessIdProperty, $proc.Id)
$appWin = $root.FindFirst("Children", $pid_cond)

if (-not $appWin) { Write-Output "WINDOW_NOT_FOUND"; exit 2 }

$hwnd = $appWin.Current.NativeWindowHandle
[UI.Win32]::ShowWindow([IntPtr]$hwnd, 9) | Out-Null
[UI.Win32]::SetForegroundWindow([IntPtr]$hwnd) | Out-Null
Start-Sleep -Milliseconds 300

switch ($Target) {
    "PersonalStudy" {
        $cond = New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::NameProperty, "Personal Study")
        $el = $appWin.FindFirst("Descendants", $cond)
        if (-not $el) { Write-Output "CONTROL_NOT_FOUND:Personal Study"; exit 3 }
        try {
            $el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
        } catch {
            Write-Output "INVOKE_FAILED:Personal Study"
            exit 3
        }
    }
    "Meetings" {
        $homeCond = New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::NameProperty, "Home")
        $homeEl = $appWin.FindFirst("Descendants", $homeCond)
        if ($homeEl) {
            try { $homeEl.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke() }
            catch { }
            Start-Sleep -Milliseconds 400
        }
        $meetCond = New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::NameProperty, "Meetings")
        $appWin2 = $root.FindFirst("Children", $pid_cond)
        $meetEl = $appWin2.FindFirst("Descendants", $meetCond)
        if (-not $meetEl) { Write-Output "CONTROL_NOT_FOUND:Meetings"; exit 3 }
        try {
            $meetEl.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
        } catch {
            Write-Output "INVOKE_FAILED:Meetings"
            exit 3
        }
    }
    default { Write-Output "UNKNOWN_TARGET"; exit 4 }
}
Write-Output "OK"
