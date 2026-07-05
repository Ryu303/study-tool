# Pure PowerShell HTTP Server to host Neo-Synapse BioMap
$port = 8080
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Host "Neo-Synapse BioMap server is running on http://localhost:$port/"
Write-Host "Press Ctrl+C to stop the server."

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        $urlPath = $request.RawUrl.Split('?')[0]
        if ($urlPath -eq "/") { $urlPath = "/index.html" }
        
        $localPath = $urlPath.Replace("/", "\").TrimStart('\')
        $filePath = Join-Path (Get-Location) $localPath
        
        if (Test-Path $filePath -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            
            # Match Content-Type
            if ($filePath.EndsWith(".html")) { $response.ContentType = "text/html; charset=utf-8" }
            elseif ($filePath.EndsWith(".css")) { $response.ContentType = "text/css" }
            elseif ($filePath.EndsWith(".js")) { $response.ContentType = "application/javascript" }
            elseif ($filePath.EndsWith(".ico")) { $response.ContentType = "image/x-icon" }
            
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $errorMessage = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $response.ContentLength64 = $errorMessage.Length
            $response.OutputStream.Write($errorMessage, 0, $errorMessage.Length)
        }
        $response.Close()
    }
} finally {
    $listener.Stop()
}
