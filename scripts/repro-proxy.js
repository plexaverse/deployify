const http = require('http');
const url = require('url');

const PORT = 3001;

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    console.log(`[Target Server] Received request: ${req.method} ${req.url}`);

    // Forwarded headers check
    if (req.headers['x-forwarded-host']) {
        console.log(`[Target Server] X-Forwarded-Host: ${req.headers['x-forwarded-host']}`);
    }

    if (pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Repro Page</title>
                <link rel="stylesheet" href="/styles.css">
                <style>
                    body { font-family: sans-serif; background: #0f172a; color: white; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                    .card { background: #1e293b; padding: 2rem; border-radius: 1rem; border: 1px solid #334155; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>Proxy Success!</h1>
                    <p>This content is being served from localhost:3001</p>
                    <p id="js-status">JavaScript: <span style="color: red;">Not Loaded</span></p>
                </div>
                <script src="/script.js"></script>
            </body>
            </html>
        `);
    } else if (pathname === '/styles.css') {
        res.writeHead(200, { 'Content-Type': 'text/css' });
        res.end('.card { box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); }');
    } else if (pathname === '/script.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript' });
        res.end('console.log("Script executed!"); document.getElementById("js-status").innerHTML = "JavaScript: <span style=\\"color: lime;\\">Loaded Successfully</span>";');
    } else {
        console.log(`[Target Server] 404 for: ${pathname}`);
        res.writeHead(404);
        res.end('Not Found');
    }
});

server.listen(PORT, () => {
    console.log(`[Target Server] Running at http://localhost:${PORT}`);
});
