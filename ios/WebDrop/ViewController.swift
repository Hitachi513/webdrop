import UIKit
import WebKit

class ViewController: UIViewController {

    private var webView: WKWebView!
    private var splashView: UIView!
    private var refreshControl: UIRefreshControl!

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.027, green: 0.027, blue: 0.071, alpha: 1)
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

    // ── Called after every page load (reliable injection point) ────────────
    private func injectAppMode() {
        // 1. Inject CSS
        let cssJS = """
        (function(){
          var existing = document.getElementById('wd-app-css');
          if (existing) existing.remove();
          var s = document.createElement('style');
          s.id = 'wd-app-css';
          s.textContent = `

        /* ╔══════════════════════════════════════════╗
           ║  WebDrop — iOS App Mode Override CSS     ║
           ╚══════════════════════════════════════════╝ */

        /* ── Safe areas ───────────────────────────── */
        #app { padding-top: 0 !important; }

        header {
          padding-top: env(safe-area-inset-top) !important;
          height: auto !important;
          min-height: calc(52px + env(safe-area-inset-top)) !important;
          background: rgba(6,6,18,0.96) !important;
          -webkit-backdrop-filter: blur(40px) saturate(200%) !important;
          backdrop-filter: blur(40px) saturate(200%) !important;
          border-bottom: 1px solid rgba(0,212,255,0.15) !important;
          box-shadow: 0 1px 0 rgba(0,212,255,0.08),
                      0 4px 40px rgba(0,0,0,0.8) !important;
        }

        .tab-bar {
          padding-bottom: env(safe-area-inset-bottom) !important;
          height: auto !important;
          min-height: calc(56px + env(safe-area-inset-bottom)) !important;
          background: rgba(6,6,18,0.96) !important;
          -webkit-backdrop-filter: blur(40px) saturate(200%) !important;
          backdrop-filter: blur(40px) saturate(200%) !important;
          border-top: 1px solid rgba(0,212,255,0.12) !important;
          box-shadow: 0 -4px 32px rgba(0,0,0,0.7) !important;
        }

        #main {
          padding-bottom: calc(60px + env(safe-area-inset-bottom)) !important;
        }

        .user-dropdown,
        .speedtest-card {
          top: calc(env(safe-area-inset-top) + 52px + 8px) !important;
        }

        /* ── App-style radar ──────────────────────── */
        #radar-section {
          padding: 20px 0 0 !important;
          background: radial-gradient(
            ellipse 80% 60% at 50% 50%,
            rgba(0,212,255,0.06) 0%,
            rgba(123,47,247,0.04) 40%,
            transparent 70%
          ) !important;
        }

        #radar {
          width:  min(78vw, 290px) !important;
          height: min(78vw, 290px) !important;
        }

        /* ── Card-style send area ─────────────────── */
        #drop-zone {
          border-radius:    28px !important;
          border:           1.5px solid rgba(0,212,255,0.2) !important;
          background:       linear-gradient(145deg,
                              rgba(0,212,255,0.07) 0%,
                              rgba(123,47,247,0.07) 100%) !important;
          padding:          28px 20px !important;
          margin:           0 10px !important;
          box-shadow:       0 8px 40px rgba(0,0,0,0.5),
                            inset 0 1px 0 rgba(255,255,255,0.07),
                            0 0 0 1px rgba(0,212,255,0.04) !important;
        }

        .drop-icon-wrap svg {
          width:  56px !important;
          height: 56px !important;
          filter: drop-shadow(0 0 16px rgba(0,212,255,0.5)) !important;
        }

        #drop-label {
          font-size:   1.1rem !important;
          font-weight: 700 !important;
          letter-spacing: -0.01em !important;
          margin: 12px 0 18px !important;
          background: linear-gradient(135deg, #00d4ff, #7b2ff7) !important;
          -webkit-background-clip: text !important;
          -webkit-text-fill-color: transparent !important;
          background-clip: text !important;
        }

        label[for=folder-input] { display: none !important; }

        .drop-opt-btn {
          border-radius: 18px !important;
          padding:       14px 28px !important;
          font-size:     1rem !important;
          font-weight:   700 !important;
          min-height:    52px !important;
          letter-spacing: -0.01em !important;
          background: linear-gradient(135deg,
            rgba(0,212,255,0.15),
            rgba(123,47,247,0.15)) !important;
          border: 1px solid rgba(0,212,255,0.3) !important;
          box-shadow: 0 4px 20px rgba(0,0,0,0.4) !important;
        }

        /* ── Tab bar icons bigger ─────────────────── */
        .tab-btn {
          padding: 8px 0 6px !important;
          min-height: 56px !important;
          font-size: .7rem !important;
          letter-spacing: .03em !important;
          font-weight: 600 !important;
        }
        .tab-btn svg { width: 24px !important; height: 24px !important; }
        .tab-btn.active { color: #00d4ff !important; }
        .tab-btn.active svg {
          filter: drop-shadow(0 0 8px rgba(0,212,255,0.6)) !important;
        }

        /* ── Touch targets ────────────────────────── */
        .btn-icon {
          min-width:  44px !important;
          min-height: 44px !important;
        }

        /* ── Chat input safe area ─────────────────── */
        #input-bar {
          padding-bottom: max(10px, env(safe-area-inset-bottom)) !important;
        }

        /* ── Bottom-sheet modals ──────────────────── */
        .modal {
          align-items:    flex-end !important;
        }
        .modal-box {
          border-radius:  28px 28px 0 0 !important;
          max-width:      100% !important;
          width:          100% !important;
          max-height:     88vh !important;
          overflow-y:     auto !important;
          padding-top:    32px !important;
          padding-bottom: calc(28px + env(safe-area-inset-bottom)) !important;
        }
        .modal-box::before {
          content:    '' !important;
          display:    block !important;
          width:      36px !important;
          height:     4px !important;
          border-radius: 2px !important;
          background: rgba(255,255,255,0.18) !important;
          margin:     -16px auto 20px !important;
        }

        /* ── Hide web-only UI ─────────────────────── */
        #install-hint-btn,
        #install-banner,
        .feedback-fab { display: none !important; }

        /* ── No text selection outside inputs ─────── */
        body { -webkit-user-select: none !important; }
        input, textarea, [contenteditable] {
          -webkit-user-select: text !important;
        }

        `;
          document.head.appendChild(s);
        })();
        """

        // 2. DOM tweaks
        let domJS = """
        (function(){
          document.documentElement.classList.add('wd-native-app');

          var lbl = document.getElementById('drop-label');
          if (lbl && !lbl.dataset.appPatched) {
            lbl.textContent = '點擊傳送檔案或照片';
            lbl.dataset.appPatched = '1';
          }

          // Prevent pinch-zoom
          document.addEventListener('gesturestart', function(e){
            e.preventDefault();
          }, {passive: false});
        })();
        """

        webView.evaluateJavaScript(cssJS, completionHandler: nil)
        webView.evaluateJavaScript(domJS, completionHandler: nil)
    }

    private func setupSplash() {
        splashView = UIView()
        splashView.backgroundColor = UIColor(red: 0.027, green: 0.027, blue: 0.071, alpha: 1)
        splashView.translatesAutoresizingMaskIntoConstraints = false

        let iconBg = UIView()
        iconBg.translatesAutoresizingMaskIntoConstraints = false
        iconBg.layer.cornerRadius = 20
        iconBg.layer.borderWidth = 1.5
        iconBg.layer.borderColor = UIColor(red: 0, green: 0.83, blue: 1, alpha: 0.5).cgColor

        let icon = UILabel()
        icon.text = "↑"
        icon.font = .systemFont(ofSize: 28, weight: .bold)
        icon.textColor = UIColor(red: 0, green: 0.83, blue: 1, alpha: 1)
        icon.textAlignment = .center
        icon.translatesAutoresizingMaskIntoConstraints = false
        iconBg.addSubview(icon)

        let title = UILabel()
        title.text = "WebDrop"
        title.textColor = .white
        title.font = .systemFont(ofSize: 28, weight: .bold)
        title.translatesAutoresizingMaskIntoConstraints = false

        let row = UIStackView(arrangedSubviews: [iconBg, title])
        row.axis = .horizontal
        row.spacing = 10
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

            iconBg.widthAnchor.constraint(equalToConstant: 52),
            iconBg.heightAnchor.constraint(equalToConstant: 52),
            icon.centerXAnchor.constraint(equalTo: iconBg.centerXAnchor),
            icon.centerYAnchor.constraint(equalTo: iconBg.centerYAnchor),

            row.centerXAnchor.constraint(equalTo: splashView.centerXAnchor),
            row.centerYAnchor.constraint(equalTo: splashView.centerYAnchor, constant: -18),

            spinner.centerXAnchor.constraint(equalTo: splashView.centerXAnchor),
            spinner.topAnchor.constraint(equalTo: row.bottomAnchor, constant: 30),
        ])
    }

    private func loadSite() {
        let req = URLRequest(url: URL(string: "https://webdrop-6l1u.onrender.com")!,
                             cachePolicy: .reloadIgnoringLocalCacheData)
        webView.load(req)
    }

    private func hideSplash() {
        guard !splashView.isHidden else { return }
        UIView.animate(withDuration: 0.45, delay: 0, options: .curveEaseInOut) {
            self.splashView.alpha = 0
        } completion: { _ in
            self.splashView.isHidden = true
        }
    }

    @objc private func pull() { webView.reload() }

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
}

extension ViewController: WKNavigationDelegate {
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        refreshControl.endRefreshing()
        injectAppMode()          // inject CSS + DOM tweaks after every load
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
