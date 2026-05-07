import { NextResponse } from "next/server";

/**
 * Return an HTML page that attempts to open the desktop app via deep link
 * and shows a manual "Open OmniTool" button as fallback.
 *
 * Used by OAuth callback routes for the desktop flow — some browsers block
 * automatic redirects to custom URL schemes (omnitool://), so we need
 * an interactive page the user can click.
 */
export function desktopOAuthCompletePage(
  provider: string,
  status: "success" | "error",
  reason?: string,
): NextResponse {
  const reasonParam = reason ? `&reason=${encodeURIComponent(reason)}` : "";
  const deepLink = `omnitool://oauth-complete?provider=${provider}&status=${status}${reasonParam}`;
  const isSuccess = status === "success";
  const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);
  // Escape reason for safe HTML inlining (no innerHTML).
  const reasonHtml = reason
    ? reason
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OmniTool — ${providerName} ${isSuccess ? "Connected" : "Error"}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0a0a0a;
      color: #e5e5e5;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .card {
      text-align: center;
      max-width: 420px;
      padding: 48px 32px;
      border-radius: 16px;
      background: #171717;
      border: 1px solid #262626;
    }
    .icon {
      font-size: 48px;
      margin-bottom: 16px;
    }
    h1 {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 8px;
    }
    p {
      font-size: 14px;
      color: #a3a3a3;
      margin-bottom: 24px;
      line-height: 1.5;
    }
    .btn {
      display: inline-block;
      padding: 12px 32px;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 500;
      text-decoration: none;
      cursor: pointer;
      border: none;
      transition: background 0.15s;
    }
    .btn-primary {
      background: #2563eb;
      color: #fff;
    }
    .btn-primary:hover {
      background: #1d4ed8;
    }
    .btn-secondary {
      background: #262626;
      color: #e5e5e5;
      margin-top: 12px;
    }
    .btn-secondary:hover {
      background: #333;
    }
    .status {
      font-size: 12px;
      color: #737373;
      margin-top: 20px;
    }
    .status.trying {
      color: #facc15;
    }
    .status.opened {
      color: #22c55e;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${isSuccess ? "✓" : "✗"}</div>
    <h1>${isSuccess ? `${providerName} Connected` : `${providerName} Connection Failed`}</h1>
    <p>${isSuccess
      ? "Your account has been linked. Return to OmniTool to continue."
      : "Something went wrong during authorization. Please try again from OmniTool."
    }</p>
    ${
      !isSuccess && reasonHtml
        ? `<p style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:#f87171;background:#1f1010;padding:10px 12px;border-radius:6px;text-align:left;word-break:break-word;">${reasonHtml}</p>`
        : ""
    }
    <a href="${deepLink}" class="btn btn-primary" id="open-btn">
      Open OmniTool
    </a>
    <br>
    <button class="btn btn-secondary" onclick="window.close()">
      Close this tab
    </button>
    <div class="status" id="status">Attempting to open OmniTool…</div>
  </div>
  <script>
    // Auto-attempt the deep link
    (function() {
      var status = document.getElementById('status');
      var opened = false;

      // Try iframe approach first (works in more browsers)
      var iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = '${deepLink}';
      document.body.appendChild(iframe);

      // Also try direct navigation after a short delay
      setTimeout(function() {
        window.location.href = '${deepLink}';
      }, 300);

      // If we're still here after 2s, the deep link probably didn't work
      setTimeout(function() {
        if (!opened) {
          status.textContent = 'Click "Open OmniTool" if the app didn\\'t open automatically.';
          status.className = 'status';
        }
      }, 2000);

      // Detect if page loses focus (app opened)
      window.addEventListener('blur', function() {
        opened = true;
        status.textContent = 'App opened!';
        status.className = 'status opened';
      });
    })();
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
