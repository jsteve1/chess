$certPath = ".\certs"
if (-not (Test-Path $certPath)) {
    New-Item -ItemType Directory -Path $certPath
}

$openssl = "openssl"

# Generate private key
& $openssl genrsa -out "$certPath\cert.key" 2048

# Generate certificate
& $openssl req -new -x509 -key "$certPath\cert.key" -out "$certPath\cert.crt" -days 365 -subj "/CN=localhost"

Write-Host "Generated SSL certificates in $certPath directory" 