import UIKit
import WebKit

class ViewController: UIViewController {

    private var webView: WKWebView!
    private var splashView: UIView!
    private var refreshControl: UIRefreshControl!

    private let headerH: CGFloat = 52

    override func viewDidLoad() {
        super.viewDidLoad()
        print("★★★ WebDrop Native v5 ★★★")
        view.backgroundColor = UIColor(red: 0.016, green: 0.016, blue: 0.055, alpha: 1)
        setupWebView()
        setupNativeHeader()
        setupSplash()
        loadSite()
    }

    // ── Native header ─────────────────────────────────────────────────────
    private func setupNativeHeader() {
        let header = UIView()
        header.translatesAutoresizingMaskIntoConstraints = false
        header.backgroundColor = UIColor(red: 0.02, green: 0.02, blue: 0.09, alpha: 0.98)

        // Cyan bottom border
        let border = UIView()
        border.backgroundColor = UIColor(red: 0, green: 0.83, blue: 1, alpha: 0.3)
        border.translatesAutoresizingMaskIntoConstraints = false

        // Icon box
        let iconBox = UIView()
        iconBox.translatesAutoresizingMaskIntoConstraints = false
        iconBox.layer.cornerRadius = 10
        iconBox.layer.borderWidth  = 1.5
        iconBox.layer.borderColor  = UIColor(red: 0, green: 0.83, blue: 1, alpha: 0.7).cgColor

        let arrow = UILabel()
        arrow.text          = "↑"
        arrow.font          = .systemFont(ofSize: 16, weight: .bold)
        arrow.textColor     = UIColor(red: 0, green: 0.83, blue: 1, alpha: 1)
        arrow.textAlignment = .center
        arrow.translatesAutoresizingMaskIntoConstraints = false

        // Title
        let titleLabel = UILabel()
        titleLabel.text      = "WebDrop"
        titleLabel.font      = .systemFont(ofSize: 18, weight: .bold)
        titleLabel.textColor = .white
        titleLabel.translatesAutoresizingMaskIntoConstraints = false

        // Pulsing dot
        let dot = UIView()
        dot.translatesAutoresizingMaskIntoConstraints = false
        dot.layer.cornerRadius = 4
        dot.backgroundColor = UIColor(red: 0, green: 0.83, blue: 1, alpha: 0.85)
        let pulse = CABasicAnimation(keyPath: "opacity")
        pulse.fromValue = 0.9; pulse.toValue = 0.2
        pulse.duration = 1.4; pulse.repeatCount = .infinity; pulse.autoreverses = true
        dot.layer.add(pulse, forKey: "pulse")

        iconBox.addSubview(arrow)
        header.addSubview(border)
        header.addSubview(iconBox)
        header.addSubview(titleLabel)
        header.addSubview(dot)
        view.addSubview(header)

        // Use safeAreaLayoutGuide so height auto-adjusts for notch / Dynamic Island
        NSLayoutConstraint.activate([
            // Header fills from very top of screen down to safeArea.top + 52
            header.topAnchor.constraint(equalTo: view.topAnchor),
            header.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            header.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            header.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor,
                                           constant: headerH),

            border.leadingAnchor.constraint(equalTo: header.leadingAnchor),
            border.trailingAnchor.constraint(equalTo: header.trailingAnchor),
            border.bottomAnchor.constraint(equalTo: header.bottomAnchor),
            border.heightAnchor.constraint(equalToConstant: 0.5),

            iconBox.widthAnchor.constraint(equalToConstant: 32),
            iconBox.heightAnchor.constraint(equalToConstant: 32),
            iconBox.leadingAnchor.constraint(equalTo: header.leadingAnchor, constant: 16),
            iconBox.bottomAnchor.constraint(equalTo: header.bottomAnchor, constant: -10),

            arrow.centerXAnchor.constraint(equalTo: iconBox.centerXAnchor),
            arrow.centerYAnchor.constraint(equalTo: iconBox.centerYAnchor),

            titleLabel.leadingAnchor.constraint(equalTo: iconBox.trailingAnchor, constant: 8),
            titleLabel.centerYAnchor.constraint(equalTo: iconBox.centerYAnchor),

            dot.widthAnchor.constraint(equalToConstant: 8),
            dot.heightAnchor.constraint(equalToConstant: 8),
            dot.trailingAnchor.constraint(equalTo: header.trailingAnchor, constant: -16),
            dot.centerYAnchor.constraint(equalTo: iconBox.centerYAnchor),
        ])

        // WebView sits directly below the header
        webView.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: header.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
    }

    // ── WebView ───────────────────────────────────────────────────────────
    private func setupWebView() {
        let cfg = WKWebViewConfiguration()
        cfg.allowsInlineMediaPlayback = true
        cfg.mediaTypesRequiringUserActionForPlayback = []

        // Hide website's own header (we have native one), fix bottom padding
        cfg.userContentController.addUserScript(WKUserScript(
            source: """
            (function(){
              var s=document.createElement('style');
              s.textContent='header{display:none!important}'
                +'#app{padding-top:0!important}'
                +'.tab-bar{padding-bottom:env(safe-area-inset-bottom)!important}'
                +'#main{padding-bottom:calc(64px + env(safe-area-inset-bottom))!important}'
                +'#install-hint-btn,#install-banner,.feedback-fab{display:none!important}'
                +'label[for=folder-input]{display:none!important}';
              document.head.appendChild(s);
            })();
            """,
            injectionTime: .atDocumentEnd,
            forMainFrameOnly: true
        ))

        webView = WKWebView(frame: .zero, configuration: cfg)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = false
        webView.scrollView.contentInsetAdjustmentBehavior = .automatic
        webView.scrollView.minimumZoomScale = 1.0
        webView.scrollView.maximumZoomScale = 1.0
        view.addSubview(webView)   // constraints set in setupNativeHeader()

        refreshControl = UIRefreshControl()
        refreshControl.tintColor = UIColor(white: 1, alpha: 0.4)
        refreshControl.addTarget(self, action: #selector(pull), for: .valueChanged)
        webView.scrollView.addSubview(refreshControl)
    }

    // ── Splash ────────────────────────────────────────────────────────────
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
        arrow.text = "↑"; arrow.font = .systemFont(ofSize: 26, weight: .bold)
        arrow.textColor = UIColor(red: 0, green: 0.83, blue: 1, alpha: 1)
        arrow.textAlignment = .center
        arrow.translatesAutoresizingMaskIntoConstraints = false
        iconBox.addSubview(arrow)

        let title = UILabel()
        title.text = "WebDrop"; title.textColor = .white
        title.font = .systemFont(ofSize: 26, weight: .bold)

        let row = UIStackView(arrangedSubviews: [iconBox, title])
        row.axis = .horizontal; row.spacing = 10; row.alignment = .center
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
        webView.load(URLRequest(url: URL(string: "https://webdrop-6l1u.onrender.com")!,
                                cachePolicy: .reloadIgnoringLocalCacheData))
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
        print("★ didFinish")
        refreshControl.endRefreshing()
        hideSplash()
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        refreshControl.endRefreshing(); showOffline(error)
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation _: WKNavigation!, withError error: Error) {
        refreshControl.endRefreshing(); hideSplash()
        let e = error as NSError; guard e.code != NSURLErrorCancelled else { return }
        showOffline(error)
    }
    private func showOffline(_ error: Error) {
        let a = UIAlertController(title: "無法連線", message: "請確認網路後再試。", preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "重試", style: .default) { [weak self] _ in self?.loadSite() })
        a.addAction(UIAlertAction(title: "取消", style: .cancel))
        present(a, animated: true)
    }
}

extension ViewController: WKUIDelegate {
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if navigationAction.targetFrame == nil { webView.load(navigationAction.request) }
        return nil
    }
}
