import UIKit
import WebKit

class ViewController: UIViewController {

    private var webView: WKWebView!
    private var splashView: UIView!
    private var nativeHeader: UIView!
    private var headerGradient: CAGradientLayer!
    private var refreshControl: UIRefreshControl!

    private let headerHeight: CGFloat = 52

    // ── Layout ────────────────────────────────────────────────────────────
    // Structure:
    //   [Native header] ← pure Swift, always visible, extends behind status bar
    //   [WKWebView    ] ← website content, starts below header
    //
    // CSS is injected only to hide the website's own header and fix the
    // bottom padding. No other CSS is required for the app-like look.

    override func viewDidLoad() {
        super.viewDidLoad()
        print("★★★ WebDrop Native v4 ★★★")
        view.backgroundColor = UIColor(red: 0.016, green: 0.016, blue: 0.055, alpha: 1)
        setupWebView()
        setupNativeHeader()
        setupSplash()
        loadSite()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        headerGradient.frame = nativeHeader.bounds
    }

    // ── Native header ─────────────────────────────────────────────────────
    private func setupNativeHeader() {
        let safeTop = view.safeAreaInsets.top

        nativeHeader = UIView()
        nativeHeader.translatesAutoresizingMaskIntoConstraints = false

        // Gradient background: deep navy → subtle cyan tint
        headerGradient = CAGradientLayer()
        headerGradient.colors = [
            UIColor(red: 0.02, green: 0.02, blue: 0.09, alpha: 0.98).cgColor,
            UIColor(red: 0.02, green: 0.05, blue: 0.12, alpha: 0.98).cgColor,
        ]
        headerGradient.startPoint = CGPoint(x: 0, y: 0)
        headerGradient.endPoint   = CGPoint(x: 1, y: 1)
        nativeHeader.layer.addSublayer(headerGradient)

        // Bottom border line (cyan)
        let border = UIView()
        border.backgroundColor     = UIColor(red: 0, green: 0.83, blue: 1, alpha: 0.25)
        border.translatesAutoresizingMaskIntoConstraints = false
        nativeHeader.addSubview(border)

        // Logo icon
        let iconBox = UIView()
        iconBox.layer.cornerRadius = 10
        iconBox.layer.borderWidth  = 1.5
        iconBox.layer.borderColor  = UIColor(red: 0, green: 0.83, blue: 1, alpha: 0.6).cgColor
        iconBox.translatesAutoresizingMaskIntoConstraints = false

        let arrowLabel = UILabel()
        arrowLabel.text          = "↑"
        arrowLabel.font          = .systemFont(ofSize: 16, weight: .bold)
        arrowLabel.textColor     = UIColor(red: 0, green: 0.83, blue: 1, alpha: 1)
        arrowLabel.textAlignment = .center
        arrowLabel.translatesAutoresizingMaskIntoConstraints = false
        iconBox.addSubview(arrowLabel)

        // Title
        let titleLabel = UILabel()
        titleLabel.text      = "WebDrop"
        titleLabel.font      = .systemFont(ofSize: 18, weight: .bold)
        titleLabel.textColor = .white
        titleLabel.translatesAutoresizingMaskIntoConstraints = false

        // Status dot
        let dotView = UIView()
        dotView.layer.cornerRadius = 4
        dotView.backgroundColor    = UIColor(red: 0, green: 0.83, blue: 1, alpha: 0.8)
        dotView.translatesAutoresizingMaskIntoConstraints = false
        addPulseAnimation(to: dotView)

        nativeHeader.addSubview(iconBox)
        nativeHeader.addSubview(titleLabel)
        nativeHeader.addSubview(dotView)
        view.addSubview(nativeHeader)

        // Constraints
        NSLayoutConstraint.activate([
            nativeHeader.topAnchor.constraint(equalTo: view.topAnchor),
            nativeHeader.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            nativeHeader.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            nativeHeader.heightAnchor.constraint(equalToConstant: headerHeight + safeTop),

            border.leadingAnchor.constraint(equalTo: nativeHeader.leadingAnchor),
            border.trailingAnchor.constraint(equalTo: nativeHeader.trailingAnchor),
            border.bottomAnchor.constraint(equalTo: nativeHeader.bottomAnchor),
            border.heightAnchor.constraint(equalToConstant: 0.5),

            iconBox.widthAnchor.constraint(equalToConstant: 32),
            iconBox.heightAnchor.constraint(equalToConstant: 32),
            iconBox.leadingAnchor.constraint(equalTo: nativeHeader.leadingAnchor, constant: 16),
            iconBox.bottomAnchor.constraint(equalTo: nativeHeader.bottomAnchor, constant: -10),

            arrowLabel.centerXAnchor.constraint(equalTo: iconBox.centerXAnchor),
            arrowLabel.centerYAnchor.constraint(equalTo: iconBox.centerYAnchor),

            titleLabel.leadingAnchor.constraint(equalTo: iconBox.trailingAnchor, constant: 8),
            titleLabel.centerYAnchor.constraint(equalTo: iconBox.centerYAnchor),

            dotView.widthAnchor.constraint(equalToConstant: 8),
            dotView.heightAnchor.constraint(equalToConstant: 8),
            dotView.trailingAnchor.constraint(equalTo: nativeHeader.trailingAnchor, constant: -16),
            dotView.centerYAnchor.constraint(equalTo: iconBox.centerYAnchor),
        ])

        // Keep webView below the header
        updateWebViewTop()
    }

    private func updateWebViewTop() {
        let safeTop = view.safeAreaInsets.top
        let offset  = headerHeight + safeTop
        webView.frame = CGRect(x: 0, y: offset,
                               width: view.bounds.width,
                               height: view.bounds.height - offset)
    }

    override func viewWillLayoutSubviews() {
        super.viewWillLayoutSubviews()
        updateWebViewTop()
    }

    private func addPulseAnimation(to v: UIView) {
        let pulse = CABasicAnimation(keyPath: "opacity")
        pulse.fromValue   = 0.9
        pulse.toValue     = 0.3
        pulse.duration    = 1.4
        pulse.repeatCount = .infinity
        pulse.autoreverses = true
        v.layer.add(pulse, forKey: "pulse")
    }

    // ── WebView ───────────────────────────────────────────────────────────
    private func setupWebView() {
        let cfg = WKWebViewConfiguration()
        cfg.allowsInlineMediaPlayback = true
        cfg.mediaTypesRequiringUserActionForPlayback = []

        // Inject minimal CSS: just hide the website's own header and fix
        // the bottom tab bar padding. Everything else is native.
        let hideHeaderScript = WKUserScript(
            source: """
            (function(){
              var s = document.createElement('style');
              s.textContent =
                'header { display:none!important; }' +
                '#app { padding-top:0!important; }' +
                '.tab-bar { padding-bottom:env(safe-area-inset-bottom)!important; }' +
                '#main { padding-bottom:calc(64px + env(safe-area-inset-bottom))!important; }' +
                '#install-hint-btn,#install-banner,.feedback-fab{display:none!important;}' +
                'label[for=folder-input]{display:none!important;}';
              document.head.appendChild(s);
            })();
            """,
            injectionTime: .atDocumentEnd,
            forMainFrameOnly: true
        )
        cfg.userContentController.addUserScript(hideHeaderScript)

        // Use frame-based layout so we can position below native header
        webView = WKWebView(frame: .zero, configuration: cfg)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = false
        webView.scrollView.contentInsetAdjustmentBehavior = .automatic
        webView.scrollView.minimumZoomScale = 1.0
        webView.scrollView.maximumZoomScale = 1.0
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(webView)

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
        iconBox.layer.cornerRadius = 18
        iconBox.layer.borderWidth  = 1.5
        iconBox.layer.borderColor  = UIColor(red: 0, green: 0.83, blue: 1, alpha: 0.55).cgColor
        iconBox.translatesAutoresizingMaskIntoConstraints = false

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
        print("★ didFinish")
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
