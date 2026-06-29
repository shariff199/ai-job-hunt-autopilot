# kill-playwright.ps1 — safely terminate ONLY Playwright Chromium
# Your regular Chrome / Edge tabs are NOT touched.
#
# Usage: powershell -File e:\Jobs career\career-ops\kill-playwright.ps1

$killed = 0
Get-Process chrome -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -and ($_.Path -like '*ms-playwright*' -or $_.Path -like '*\.local-browsers\*') } |
    ForEach-Object {
        Stop-Process -Id $_.Id -Force -Confirm:$false -ErrorAction SilentlyContinue
        $killed++
    }
Get-Process chromium -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -and $_.Path -like '*ms-playwright*' } |
    ForEach-Object {
        Stop-Process -Id $_.Id -Force -Confirm:$false -ErrorAction SilentlyContinue
        $killed++
    }

if ($killed -eq 0) {
    "No Playwright Chromium instances were running."
} else {
    "Killed $killed Playwright Chromium process(es). Your regular Chrome/Edge tabs are safe."
}
