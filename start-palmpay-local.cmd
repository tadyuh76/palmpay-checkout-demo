@echo off
setlocal
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js/npm is required. Install Node.js 20+ first.
  exit /b 1
)

if not exist node_modules (
  echo Installing app dependencies...
  call npm install
  if errorlevel 1 exit /b 1
)

if not exist node_modules\nfc-pcsc (
  echo Installing NFC reader dependency...
  call npm install nfc-pcsc --no-save --no-package-lock
  if errorlevel 1 (
    echo Could not install nfc-pcsc. Install the NFC reader dependency, then run this script again.
    exit /b 1
  )
)

set "PALMPAY_APP_URL=http://localhost:7999"
if not defined PALMPAY_NFC_BRIDGE_TOKEN set "PALMPAY_NFC_BRIDGE_TOKEN=local-reader-token"
if not defined PALMPAY_PALM_SCAN_TIMEOUT_MS set "PALMPAY_PALM_SCAN_TIMEOUT_MS=45000"

echo Starting NFC bridge in a new window...
start "PalmPay NFC bridge" /D "%CD%" cmd /k "npm run nfc:bridge"

echo Starting PalmPay app at http://localhost:7999
call npm run dev -- -H 0.0.0.0 -p 7999
