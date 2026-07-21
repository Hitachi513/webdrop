import UIKit
import WebKit

class ViewController: UIViewController {

    private var webView: WKWebView!
    private var splashView: UIView!
    private var refreshControl: UIRefreshControl!

    // ── App-mode CSS injected into every page load ─────────────────────────
    // Key changes vs. web:
    //   • Header extends BEHIND the status bar (full-bleed), not below it
    //   • Tab bar extends behind the home indicator
    //   • Disable drag-and-drop hints; promote tap targets
    //   • Hide PWA install UI (irrelevant inside the native shell)
    //   • Larger radar, card-style drop zone, native iOS glass aesthetics
    private static let appCSS: String = {
        let css = """
        /* ═══════════════════════════════════════════════
           WebDrop — iOS Native App Mode
           Injected by ViewController.swift
        ════════════════════════════════════════════════ */

        /* ── 1. Header: fill behind Dynamic Island / notch ── */
        #app { padding-top: 0 !important; }

        header {
          padding-top: env(safe-area-inset-top) !important;
          height: auto !important;
          min-height: calc(58px + env(safe-area-inset-top)) !important;
          /* Stronger frosted glass for native feel */
          background: var(--header-glass) !important;
          -webkit-backdrop-filter: saturate(200%) blur(32px) !important;
          backdrop-filter:         saturate(200%) blur(32px) !important;
          box-shadow: 0 0.5px 0 rgba(255,255,255,0.08),
                      0 2px 24px rgba(0,0,0,0.5) !important;
          border-bottom: none !important;
        }

        /* Shift dropdowns that are anchored below header height */
        .user-dropdown,
        .speedtest-card {
          top: calc(env(safe-area-inset-top) + 58px + 8px) !important;
        }

        /* ── 2. Tab bar: fill behind home indicator ─────── */
        .tab-bar {
          padding-bottom: max(env(safe-area-inset-bottom), 8px) !important;
          height: auto !important;
          min-height: calc(56px + env(safe-area-inset-bottom)) !important;
          background: var(--header-glass) !important;
          -webkit-backdrop-filter: saturate(200%) blur(32px) !important;
          backdrop-filter:         saturate(200%) blur(32px) !important;
          border-top: 0.5px solid rgba(255,255,255,0.08) !important;
          box-shadow: 0 -1px 0 rgba(var(--primary-rgb,0,212,255),0.08),
                      0 -12px 40px rgba(0,0,0,0.6) !important;
        }

        .tab-btn {
          padding-top: 10px !important;
          padding-bottom: 6px !important;
          min-height: 56px !important;
          font-size: .72rem !important;
          letter-spacing: .02em !important;
        }

        .tab-btn.active svg { filter: drop-shadow(0 0 6px var(--primary,.00d4ff)); }

        /* ── 3. Main content: compensate for header/tab heights ─ */
        #main {
          padding-top:    0 !important;
          padding-bottom: calc(56px + env(safe-area-inset-bottom) + 8px) !important;
        }

        /* ── 4. Bigger touch targets across the board ───── */
        .btn-icon {
          min-width:  44px !important;
          min-height: 44px !important;
        }
        button, a[role=button], label[class*=btn] {
          -webkit-tap-highlight-color: rgba(0,212,255,0.12) !important;
        }

        /* ── 5. Radar: scale up for phone screen ─────────── */
        #radar {
          width:  min(80vw, 300px) !important;
          height: min(80vw, 300px) !important;
        }

        /* ── 6. Drop zone: card style, tap-first copy ────── */
        #drop-zone {
          border-radius:    28px !important;
          border:           1.5px dashed rgba(0,212,255,0.2) !important;
          background:       linear-gradient(145deg,
                              rgba(0,212,255,0.05),
                              rgba(123,47,247,0.05)) !important;
          padding:          32px 20px 28px !important;
          margin:           0 8px !important;
          box-shadow:       0 4px 32px rgba(0,0,0,0.3),
                            inset 0 1px 0 rgba(255,255,255,0.06) !important;
        }

        /* Replace "Drag & drop" icon with a bigger tap icon feel */
        .drop-icon-wrap svg {
          width:  52px !important;
          height: 52px !important;
          stroke: var(--primary, #00d4ff) !important;
          filter: drop-shadow(0 0 12px rgba(0,212,255,0.3)) !important;
        }

        #drop-label {
          font-size:   1.05rem !important;
          font-weight: 600 !important;
          margin:      10px 0 16px !important;
        }

        /* Folder upload not available on iOS — hide it */
        label[for=folder-input] { display: none !important; }

        .drop-opt-btn {
          border-radius: 16px !important;
          padding:       12px 24px !important;
          font-size:     .95rem !important;
          font-weight:   600 !important;
          min-height:    48px !important;
        }

        /* ── 7. Chat input bar: avoid keyboard + home bar ── */
        #input-bar {
          padding-bottom: max(10px, env(safe-area-inset-bottom)) !important;
          padding-left:   max(12px, env(safe-area-inset-left)) !important;
          padding-right:  max(12px, env(safe-area-inset-right)) !important;
        }

        /* ── 8. Modals: bottom sheet style ───────────────── */
        .modal {
          align-items:     flex-end !important;
          padding-bottom:  0 !important;
        }
        .modal-box {
          border-radius:   28px 28px 0 0 !important;
          width:           100% !important;
          max-width:       100% !important;
          max-height:      88vh !important;
          overflow-y:      auto !important;
          -webkit-overflow-scrolling: touch !important;
          padding-bottom:  calc(24px + env(safe-area-inset-bottom)) !important;
          /* Drag handle visual */
          padding-top:     28px !important;
        }
        /* Bottom sheet drag handle */
        .modal-box::before {
          content:          '' !important;
          display:          block !important;
          width:            40px !important;
          height:           4px !important;
          border-radius:    2px !important;
          background:       rgba(255,255,255,0.2) !important;
          margin:           -12px auto 20px !important;
        }

        /* ── 9. Hide web-specific UI ─────────────────────── */
        #install-hint-btn,
        #install-banner,
        .feedback-fab {
          display: none !important;
        }

        /* ── 10. Prevent text selection (more native feel) ── */
        body { -webkit-user-select: none !important; user-select: none !important; }
        #message-input, input, textarea {
          -webkit-user-select: text !important;
          user-select:         text !important;
        }

        /* ── 11. Smooth scroll everywhere ───────────────── */
        * { -webkit-overflow-scrolling: touch; }
        """
        return css
    }()

    // ── Minimal JS for app context ─────────────────────────────────────────
    private static let appJS = """
    (function () {
      // Mark as native app so future JS can gate behaviour
      document.documentElement.classList.add('wd-native-app');

      // Change drag-and-drop label to tap-friendly copy
      var lbl = document.getElementById('drop-label');
      if (lbl) lbl.textContent = '點擊選擇或拍照傳送';

      // Prevent pinch-zoom (feels wrong in an app)
      document.addEventListener('gesturestart', function(e){ e.preventDefault(); }, {passive: false});
    })();
    """

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.039, green: 0.039, blue: 0.094, alpha: 1)
        setupWebView()
        setupSplash()
        loadSite()
    }

    private func setupWebView() {
        let cfg = WKWebViewConfiguration()
        cfg.allowsInlineMediaPlayback = true
        cfg.mediaTypesRequiringUserActionForPlayback = []

        // Inject app-mode CSS and JS on every page (atDocumentEnd so DOM exists)
        let cssData  = Self.appCSS.data(using: .utf8)!
        let cssB64   = cssData.base64EncodedString()
        let injectSource = """
        (function(){
          if (document.getElementById('wd-app-style')) return;
          var s = document.createElement('style');
          s.id = 'wd-app-style';
          s.textContent = atob('\(cssB64)');
          document.head.appendChild(s);
          \(Self.appJS)
        })();
        """
        let script = WKUserScript(source: injectSource,
                                  injectionTime: .atDocumentEnd,
                                  forMainFrameOnly: true)
        cfg.userContentController.addUserScript(script)

        webView = WKWebView(frame: .zero, configuration: cfg)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = false // disable swipe nav in app
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
        refreshControl.tintColor = UIColor(white: 1, alpha: 0.5)
        refreshControl.addTarget(self, action: #selector(pull), for: .valueChanged)
        webView.scrollView.addSubview(refreshControl)
    }

    private func setupSplash() {
        splashView = UIView(frame: .zero)
        splashView.backgroundColor = UIColor(red: 0.027, green: 0.027, blue: 0.071, alpha: 1)
        splashView.translatesAutoresizingMaskIntoConstraints = false

        let logo = makeLogoView()
        logo.translatesAutoresizingMaskIntoConstraints = false

        let spinner = UIActivityIndicatorView(style: .medium)
        spinner.color = UIColor(red: 0, green: 0.83, blue: 1, alpha: 0.6)
        spinner.translatesAutoresizingMaskIntoConstraints = false
        spinner.startAnimating()

        splashView.addSubview(logo)
        splashView.addSubview(spinner)
        view.addSubview(splashView)

        NSLayoutConstraint.activate([
            splashView.topAnchor.constraint(equalTo: view.topAnchor),
            splashView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            splashView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            splashView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            logo.centerXAnchor.constraint(equalTo: splashView.centerXAnchor),
            logo.centerYAnchor.constraint(equalTo: splashView.centerYAnchor, constant: -20),
            spinner.centerXAnchor.constraint(equalTo: splashView.centerXAnchor),
            spinner.topAnchor.constraint(equalTo: logo.bottomAnchor, constant: 28),
        ])
    }

    private func makeLogoView() -> UIView {
        let stack = UIStackView()
        stack.axis = .horizontal
        stack.alignment = .center
        stack.spacing = 10

        // Gradient circle icon substitute using a label
        let iconContainer = UIView()
        iconContainer.translatesAutoresizingMaskIntoConstraints = false
        iconContainer.widthAnchor.constraint(equalToConstant: 44).isActive = true
        iconContainer.heightAnchor.constraint(equalToConstant: 44).isActive = true
        iconContainer.layer.cornerRadius = 12
        iconContainer.layer.borderWidth = 1.5
        iconContainer.layer.borderColor = UIColor(red: 0, green: 0.83, blue: 1, alpha: 0.6).cgColor

        let arrow = UILabel()
        arrow.text = "↑"
        arrow.font = .systemFont(ofSize: 22, weight: .bold)
        arrow.textColor = UIColor(red: 0, green: 0.83, blue: 1, alpha: 1)
        arrow.textAlignment = .center
        arrow.translatesAutoresizingMaskIntoConstraints = false
        iconContainer.addSubview(arrow)
        NSLayoutConstraint.activate([
            arrow.centerXAnchor.constraint(equalTo: iconContainer.centerXAnchor),
            arrow.centerYAnchor.constraint(equalTo: iconContainer.centerYAnchor),
        ])

        let label = UILabel()
        label.text = "WebDrop"
        label.textColor = .white
        label.font = .systemFont(ofSize: 26, weight: .bold)

        stack.addArrangedSubview(iconContainer)
        stack.addArrangedSubview(label)
        return stack
    }

    private func loadSite() {
        let req = URLRequest(url: URL(string: "https://webdrop-6l1u.onrender.com")!,
                             cachePolicy: .reloadIgnoringLocalCacheData)
        webView.load(req)
    }

    private func hideSplash() {
        guard !splashView.isHidden else { return }
        UIView.animate(withDuration: 0.4, delay: 0, options: .curveEaseInOut) {
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
        hideSplash()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        refreshControl.endRefreshing()
        showOffline(error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation _: WKNavigation!, withError error: Error) {
        refreshControl.endRefreshing()
        hideSplash()
        showOffline(error)
    }

    private func showOffline(_ error: Error) {
        let nsErr = error as NSError
        // Ignore "cancelled" errors from in-flight requests during navigation
        guard nsErr.code != NSURLErrorCancelled else { return }
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
