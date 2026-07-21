import UIKit
import WebKit

class ViewController: UIViewController {

    private var webView: WKWebView!
    private var splashView: UIView!
    private var refreshControl: UIRefreshControl!

    // CSS injected after every page load.
    // Uses explicit \n concatenation — no JS template literals, no escaping surprises.
    private static func buildCSSScript() -> String {
        let rules: [String] = [
            // ── Fix safe areas ───────────────────────────────────────────────
            "#app { padding-top: 0 !important; }",
            "header { padding-top: env(safe-area-inset-top) !important; height: auto !important; min-height: calc(52px + env(safe-area-inset-top)) !important; }",
            ".tab-bar { padding-bottom: env(safe-area-inset-bottom) !important; height: auto !important; min-height: calc(56px + env(safe-area-inset-bottom)) !important; }",
            "#main { padding-bottom: calc(64px + env(safe-area-inset-bottom)) !important; }",
            ".user-dropdown { top: calc(env(safe-area-inset-top) + 52px + 8px) !important; }",
            ".speedtest-card { top: calc(env(safe-area-inset-top) + 52px + 8px) !important; }",

            // ── Header: deep glass ──────────────────────────────────────────
            "header { background: rgba(4,4,14,0.97) !important; -webkit-backdrop-filter: blur(40px) saturate(180%) !important; backdrop-filter: blur(40px) saturate(180%) !important; border-bottom: 1px solid rgba(0,212,255,0.2) !important; box-shadow: 0 2px 32px rgba(0,0,0,0.9) !important; }",

            // ── Tab bar: deep glass ─────────────────────────────────────────
            ".tab-bar { background: rgba(4,4,14,0.97) !important; -webkit-backdrop-filter: blur(40px) saturate(180%) !important; backdrop-filter: blur(40px) saturate(180%) !important; border-top: 1px solid rgba(0,212,255,0.2) !important; box-shadow: 0 -4px 32px rgba(0,0,0,0.8) !important; }",
            ".tab-btn { padding: 8px 0 6px !important; min-height: 56px !important; font-size: .72rem !important; font-weight: 600 !important; }",
            ".tab-btn svg { width: 24px !important; height: 24px !important; }",
            ".tab-btn.active { color: #00d4ff !important; }",
            ".tab-btn.active svg { filter: drop-shadow(0 0 8px rgba(0,212,255,0.7)) !important; }",

            // ── Radar: bigger ───────────────────────────────────────────────
            "#radar { width: min(78vw, 288px) !important; height: min(78vw, 288px) !important; }",
            "#radar-section { background: radial-gradient(ellipse 80% 60% at 50% 50%, rgba(0,212,255,0.07) 0%, rgba(123,47,247,0.04) 45%, transparent 70%) !important; padding-top: 16px !important; }",

            // ── Drop zone: card style ───────────────────────────────────────
            "#drop-zone { border-radius: 28px !important; border: 1.5px solid rgba(0,212,255,0.25) !important; background: linear-gradient(145deg, rgba(0,212,255,0.08) 0%, rgba(123,47,247,0.08) 100%) !important; padding: 28px 20px !important; margin: 0 10px !important; box-shadow: 0 8px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.07) !important; }",
            ".drop-icon-wrap svg { width: 56px !important; height: 56px !important; filter: drop-shadow(0 0 18px rgba(0,212,255,0.6)) !important; }",
            "#drop-label { font-size: 1.05rem !important; font-weight: 700 !important; margin: 12px 0 18px !important; color: #00d4ff !important; }",
            "label[for=folder-input] { display: none !important; }",
            ".drop-opt-btn { border-radius: 18px !important; padding: 13px 26px !important; font-size: .98rem !important; font-weight: 700 !important; min-height: 50px !important; background: linear-gradient(135deg, rgba(0,212,255,0.15), rgba(123,47,247,0.18)) !important; border: 1px solid rgba(0,212,255,0.35) !important; box-shadow: 0 4px 20px rgba(0,0,0,0.4) !important; }",

            // ── Touch targets ───────────────────────────────────────────────
            ".btn-icon { min-width: 44px !important; min-height: 44px !important; }",

            // ── Chat input ──────────────────────────────────────────────────
            "#input-bar { padding-bottom: max(10px, env(safe-area-inset-bottom)) !important; }",

            // ── Bottom-sheet modals ─────────────────────────────────────────
            ".modal { align-items: flex-end !important; }",
            ".modal-box { border-radius: 28px 28px 0 0 !important; max-width: 100% !important; width: 100% !important; max-height: 88vh !important; overflow-y: auto !important; padding-top: 32px !important; padding-bottom: calc(28px + env(safe-area-inset-bottom)) !important; }",

            // ── Hide web-only UI ────────────────────────────────────────────
            "#install-hint-btn, #install-banner, .feedback-fab { display: none !important; }",

            // ── No accidental text selection ────────────────────────────────
            "body { -webkit-user-select: none !important; }",
            "input, textarea, [contenteditable] { -webkit-user-select: text !important; }",
        ]

        // Build JS that concatenates each rule into a style element.
        // Escape double-quotes inside each rule so the JS string stays valid.
        let jsLines = rules.map { rule -> String in
            let escaped = rule
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "\"", with: "\\\"")
            return "    lines.push(\"\(escaped)\");"
        }.joined(separator: "\n")

        return """
        (function(){
          try {
            var old = document.getElementById('wd-app-css');
            if (old) old.remove();
            var lines = [];
        \(jsLines)
            var s = document.createElement('style');
            s.id = 'wd-app-css';
            s.textContent = lines.join('\\n');
            document.head.appendChild(s);
            console.log('[WebDrop] app-mode CSS injected (' + lines.length + ' rules)');
          } catch(e) {
            console.error('[WebDrop] CSS injection failed:', e);
          }
        })();
        """
    }

    private static func buildDOMScript() -> String {
        return """
        (function(){
          try {
            document.documentElement.classList.add('wd-native-app');
            var lbl = document.getElementById('drop-label');
            if (lbl && !lbl.dataset.appFixed) {
              lbl.textContent = '點擊傳送檔案或照片';
              lbl.dataset.appFixed = '1';
            }
            document.addEventListener('gesturestart', function(e){ e.preventDefault(); }, {passive:false});
            console.log('[WebDrop] DOM tweaks applied');
          } catch(e) {
            console.error('[WebDrop] DOM tweak failed:', e);
          }
        })();
        """
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        print("★★★ WebDrop App v3 loaded ★★★")
        view.backgroundColor = UIColor(red: 0.016, green: 0.016, blue: 0.055, alpha: 1)
        setupWebView()
        setupSplash()
        loadSite()
    }

    private func setupWebView() {
        let cfg = WKWebViewConfiguration()
        cfg.allowsInlineMediaPlayback = true
        cfg.mediaTypesRequiringUserActionForPlayback = []

        webView = WKWebView(frame: .zero, configuration: cfg)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.minimumZoomScale = 1.0
        webView.scrollView.maximumZoomScale = 1.0
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)

        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])

        refreshControl = UIRefreshControl()
        refreshControl.tintColor = UIColor(white: 1, alpha: 0.4)
        refreshControl.addTarget(self, action: #selector(pull), for: .valueChanged)
        webView.scrollView.addSubview(refreshControl)
    }

    private func injectAppMode() {
        let cssScript = Self.buildCSSScript()
        let domScript = Self.buildDOMScript()
        webView.evaluateJavaScript(cssScript) { _, err in
            if let err = err { print("[WebDrop] CSS error:", err) }
        }
        webView.evaluateJavaScript(domScript) { _, err in
            if let err = err { print("[WebDrop] DOM error:", err) }
        }
    }

    private func setupSplash() {
        splashView = UIView()
        splashView.backgroundColor = UIColor(red: 0.016, green: 0.016, blue: 0.055, alpha: 1)
        splashView.translatesAutoresizingMaskIntoConstraints = false

        let iconBox = UIView()
        iconBox.translatesAutoresizingMaskIntoConstraints = false
        iconBox.layer.cornerRadius = 18
        iconBox.layer.borderWidth  = 1.5
        iconBox.layer.borderColor  = UIColor(red: 0, green: 0.83, blue: 1, alpha: 0.55).cgColor

        let arrow = UILabel()
        arrow.text          = "↑"
        arrow.font          = .systemFont(ofSize: 26, weight: .bold)
        arrow.textColor     = UIColor(red: 0, green: 0.83, blue: 1, alpha: 1)
        arrow.textAlignment = .center
        arrow.translatesAutoresizingMaskIntoConstraints = false
        iconBox.addSubview(arrow)

        let title = UILabel()
        title.text      = "WebDrop"
        title.textColor = .white
        title.font      = .systemFont(ofSize: 26, weight: .bold)

        let row = UIStackView(arrangedSubviews: [iconBox, title])
        row.axis      = .horizontal
        row.spacing   = 10
        row.alignment = .center
        row.translatesAutoresizingMaskIntoConstraints = false

        let spinner = UIActivityIndicatorView(style: .medium)
        spinner.color = UIColor(red: 0, green: 0.83, blue: 1, alpha: 0.5)
        spinner.translatesAutoresizingMaskIntoConstraints = false
        spinner.startAnimating()

        splashView.addSubview(row)
        splashView.addSubview(spinner)
        view.addSubview(splashView)

        NSLayoutConstraint.activate([
            splashView.topAnchor.constraint(equalTo: view.topAnchor),
            splashView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            splashView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            splashView.trailingAnchor.constraint(equalTo: view.trailingAnchor),

            iconBox.widthAnchor.constraint(equalToConstant: 48),
            iconBox.heightAnchor.constraint(equalToConstant: 48),
            arrow.centerXAnchor.constraint(equalTo: iconBox.centerXAnchor),
            arrow.centerYAnchor.constraint(equalTo: iconBox.centerYAnchor),

            row.centerXAnchor.constraint(equalTo: splashView.centerXAnchor),
            row.centerYAnchor.constraint(equalTo: splashView.centerYAnchor, constant: -20),

            spinner.centerXAnchor.constraint(equalTo: splashView.centerXAnchor),
            spinner.topAnchor.constraint(equalTo: row.bottomAnchor, constant: 28),
        ])
    }

    private func loadSite() {
        let req = URLRequest(url: URL(string: "https://webdrop-6l1u.onrender.com")!,
                             cachePolicy: .reloadIgnoringLocalCacheData)
        webView.load(req)
    }

    private func hideSplash() {
        guard !splashView.isHidden else { return }
        UIView.animate(withDuration: 0.4) { self.splashView.alpha = 0 } completion: { _ in
            self.splashView.isHidden = true
        }
    }

    @objc private func pull() { webView.reload() }

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
}

extension ViewController: WKNavigationDelegate {
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        refreshControl.endRefreshing()
        injectAppMode()
        hideSplash()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        refreshControl.endRefreshing()
        showOffline(error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation _: WKNavigation!, withError error: Error) {
        refreshControl.endRefreshing()
        hideSplash()
        let nsErr = error as NSError
        guard nsErr.code != NSURLErrorCancelled else { return }
        showOffline(error)
    }

    private func showOffline(_ error: Error) {
        let alert = UIAlertController(title: "無法連線", message: "請確認網路後再試。", preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "重試", style: .default) { [weak self] _ in self?.loadSite() })
        alert.addAction(UIAlertAction(title: "取消", style: .cancel))
        present(alert, animated: true)
    }
}

extension ViewController: WKUIDelegate {
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if navigationAction.targetFrame == nil { webView.load(navigationAction.request) }
        return nil
    }
}
