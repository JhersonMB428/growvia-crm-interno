# Publica en Azure la versión actual del CRM (lo que esté en el último commit).
# Uso, desde la raíz del repo:   powershell -ExecutionPolicy Bypass -File .\scripts\desplegar.ps1

$ACR = 'growviaregistry'
$RG  = 'growvia-crm-rg'
$APP = 'growvia-crm'

if (git status --porcelain) { Write-Host 'Hay cambios sin commit. Haz commit antes de desplegar.' -ForegroundColor Red; exit 1 }

$TAG = git rev-parse --short HEAD
Write-Host "Construyendo la imagen growvia-crm-interno:$TAG en Azure..." -ForegroundColor Cyan
az acr build -r $ACR -t "growvia-crm-interno:$TAG" .
if ($LASTEXITCODE) { Write-Host 'Falló la construcción de la imagen.' -ForegroundColor Red; exit 1 }

Write-Host 'Actualizando el Container App...' -ForegroundColor Cyan
az containerapp update -n $APP -g $RG --image "$ACR.azurecr.io/growvia-crm-interno:$TAG" --query properties.latestRevisionName -o tsv
if ($LASTEXITCODE) { Write-Host 'Falló la actualización.' -ForegroundColor Red; exit 1 }

Write-Host "Listo: versión $TAG publicada. Revisa los logs con:" -ForegroundColor Green
Write-Host "  az containerapp logs show -n $APP -g $RG --follow"