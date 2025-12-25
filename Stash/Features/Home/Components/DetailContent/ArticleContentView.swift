import SwiftUI
import WebKit

/// Article detail view with WebView for full content consumption
/// WebView scroll is disabled - outer ScrollView handles all scrolling to prevent gesture conflicts
struct ArticleContentView: View {
    let item: ItemSummary
    @State private var webViewHeight: CGFloat = 800  // Dynamic height based on content
    @State private var isLoading: Bool = true
    @State private var loadingProgress: Double = 0.0
    @State private var hasError: Bool = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 0) {
            if let url = item.canonicalUrl, let webUrl = URL(string: url) {
                ZStack(alignment: .top) {
                    // WebView (scroll disabled, expands to full content height)
                    ContentWebView(
                        url: webUrl,
                        contentHeight: $webViewHeight,
                        isLoading: $isLoading,
                        loadingProgress: $loadingProgress,
                        hasError: $hasError,
                        errorMessage: $errorMessage
                    )
                    .frame(height: webViewHeight)
                    .clipShape(RoundedRectangle(cornerRadius: 12))

                    // Loading overlay
                    if isLoading {
                        VStack(spacing: 12) {
                            ProgressView(value: loadingProgress)
                                .progressViewStyle(.linear)
                                .tint(StashTheme.Color.accent)
                                .frame(maxWidth: 200)

                            Text("Loading article...")
                                .font(.system(size: 15))
                                .foregroundStyle(.secondary)
                        }
                        .padding(24)
                        .background(Color(.systemBackground).opacity(0.7))
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .padding(.top, 100)
                    }
                }

                // Error state
                if hasError {
                    VStack(spacing: 12) {
                        Image(systemName: "exclamationmark.triangle")
                            .font(.system(size: 48))
                            .foregroundStyle(StashTheme.Color.warning)

                        Text("Failed to load article")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(.primary)

                        if let error = errorMessage {
                            Text(error)
                                .font(.system(size: 15))
                                .foregroundStyle(.secondary)
                                .multilineTextAlignment(.center)
                        }

                        Button {
                            // Retry load
                            hasError = false
                            isLoading = true
                        } label: {
                            Text("Retry")
                                .font(.system(size: 16, weight: .semibold))
                                .padding(.horizontal, 24)
                                .padding(.vertical, 12)
                        }
                        .glassEffect(.regular.tint(StashTheme.Color.accent), in: .capsule)
                    }
                    .padding()
                    .frame(maxWidth: .infinity)
                    .background(Color(.systemBackground).opacity(0.5))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            } else {
                // No URL available
                VStack(spacing: 12) {
                    Image(systemName: "link.slash")
                        .font(.system(size: 48))
                        .foregroundStyle(.tertiary)

                    Text("No URL available for this article")
                        .font(.system(size: 15))
                        .foregroundStyle(.secondary)
                }
                .padding()
                .frame(maxWidth: .infinity)
                .background(Color(.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }
    }
}

// MARK: - Content WebView

/// WebView wrapper with scroll disabled and dynamic height tracking
/// Uses Coordinator for WKNavigationDelegate and height observation
struct ContentWebView: UIViewRepresentable {
    let url: URL
    @Binding var contentHeight: CGFloat
    @Binding var isLoading: Bool
    @Binding var loadingProgress: Double
    @Binding var hasError: Bool
    @Binding var errorMessage: String?

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.backgroundColor = UIColor.systemBackground
        webView.isOpaque = false
        webView.scrollView.backgroundColor = UIColor.systemBackground

        // CRITICAL: Disable WebView's own scrolling - outer ScrollView handles it
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false

        // Navigation delegate for loading states
        webView.navigationDelegate = context.coordinator

        // Observe content size changes for dynamic height
        context.coordinator.observeContentSize(webView: webView)

        // Load URL
        let request = URLRequest(url: url)
        webView.load(request)

        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        // Prevent redundant loads - only load if URL changed
        if webView.url != url {
            let request = URLRequest(url: url)
            webView.load(request)
        }
    }

    // MARK: - Coordinator (Navigation Delegate & Height Observer)

    class Coordinator: NSObject, WKNavigationDelegate {
        var parent: ContentWebView
        private var contentSizeObservation: NSKeyValueObservation?
        private var progressObservation: NSKeyValueObservation?

        init(_ parent: ContentWebView) {
            self.parent = parent
        }

        // Observe WebView's scrollView.contentSize for dynamic height
        func observeContentSize(webView: WKWebView) {
            contentSizeObservation = webView.scrollView.observe(\.contentSize, options: [.new]) { [weak self] scrollView, _ in
                guard let self = self else { return }
                DispatchQueue.main.async {
                    // Update height binding with content height
                    let newHeight = max(scrollView.contentSize.height, 800)  // Minimum 800pt
                    if abs(newHeight - self.parent.contentHeight) > 10 {  // Debounce small changes
                        self.parent.contentHeight = newHeight
                    }
                }
            }

            // Observe loading progress
            progressObservation = webView.observe(\.estimatedProgress, options: [.new]) { [weak self] webView, _ in
                guard let self = self else { return }
                DispatchQueue.main.async {
                    self.parent.loadingProgress = webView.estimatedProgress
                }
            }
        }

        // WKNavigationDelegate methods

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            parent.isLoading = true
            parent.hasError = false
            parent.errorMessage = nil
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            parent.isLoading = false
            parent.loadingProgress = 1.0
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            parent.isLoading = false
            parent.hasError = true
            parent.errorMessage = error.localizedDescription
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            parent.isLoading = false
            parent.hasError = true
            parent.errorMessage = error.localizedDescription
        }

        // Prevent external navigation - keep users in-app
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            // Allow initial load
            if navigationAction.navigationType == .other {
                decisionHandler(.allow)
                return
            }

            // For link taps, allow same-origin navigation, block external
            if let targetURL = navigationAction.request.url,
               let currentURL = webView.url {
                // Allow navigation within same domain
                if targetURL.host == currentURL.host {
                    decisionHandler(.allow)
                } else {
                    // Block external navigation (keeps user in-app)
                    print("⚠️ Blocked external navigation to: \(targetURL)")
                    decisionHandler(.cancel)
                }
            } else {
                decisionHandler(.allow)
            }
        }

        deinit {
            contentSizeObservation?.invalidate()
            progressObservation?.invalidate()
        }
    }
}
