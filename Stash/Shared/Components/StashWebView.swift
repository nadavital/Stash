import SwiftUI
import WebKit

/// A SwiftUI wrapper for WKWebView that renders web content
/// Used in detail views to display the actual content (articles, recipes, etc.)
struct StashWebView: UIViewRepresentable {
    let url: URL
    @Binding var isLoading: Bool
    @Binding var progress: Double
    var onNavigate: ((URL) -> Void)?
    
    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }
    
    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .automatic
        
        // Add progress observation
        context.coordinator.progressObservation = webView.observe(\.estimatedProgress, options: [.new]) { _, change in
            if let newValue = change.newValue {
                DispatchQueue.main.async {
                    self.progress = newValue
                }
            }
        }
        
        // Add loading observation
        context.coordinator.loadingObservation = webView.observe(\.isLoading, options: [.new]) { _, change in
            if let newValue = change.newValue {
                DispatchQueue.main.async {
                    self.isLoading = newValue
                }
            }
        }
        
        return webView
    }
    
    func updateUIView(_ webView: WKWebView, context: Context) {
        // Only load if URL changed
        if webView.url != url {
            let request = URLRequest(url: url)
            webView.load(request)
        }
    }
    
    class Coordinator: NSObject, WKNavigationDelegate {
        var parent: StashWebView
        var progressObservation: NSKeyValueObservation?
        var loadingObservation: NSKeyValueObservation?
        
        init(_ parent: StashWebView) {
            self.parent = parent
        }
        
        deinit {
            progressObservation?.invalidate()
            loadingObservation?.invalidate()
        }
        
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            parent.isLoading = false
        }
        
        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            parent.isLoading = false
        }
        
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            // Allow all navigations within the web view
            if let url = navigationAction.request.url {
                parent.onNavigate?(url)
            }
            decisionHandler(.allow)
        }
    }
}

// MARK: - Reader Mode WebView (for articles)

/// A WebView that attempts to use Safari's Reader mode styling
struct ReaderWebView: UIViewRepresentable {
    let url: URL
    @Binding var isLoading: Bool
    
    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }
    
    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        
        // Inject CSS to improve readability
        let readerCSS = """
        body {
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            font-size: 18px;
            line-height: 1.6;
            max-width: 680px;
            margin: 0 auto;
            padding: 20px;
            background: transparent;
        }
        img { max-width: 100%; height: auto; }
        """
        
        let script = WKUserScript(
            source: """
            var style = document.createElement('style');
            style.innerHTML = `\(readerCSS)`;
            document.head.appendChild(style);
            """,
            injectionTime: .atDocumentEnd,
            forMainFrameOnly: true
        )
        
        configuration.userContentController.addUserScript(script)
        
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        
        return webView
    }
    
    func updateUIView(_ webView: WKWebView, context: Context) {
        if webView.url != url {
            let request = URLRequest(url: url)
            webView.load(request)
        }
    }
    
    class Coordinator: NSObject, WKNavigationDelegate {
        var parent: ReaderWebView
        
        init(_ parent: ReaderWebView) {
            self.parent = parent
        }
        
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            parent.isLoading = false
        }
        
        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            parent.isLoading = false
        }
    }
}

// MARK: - Preview

#Preview {
    StashWebView(
        url: URL(string: "https://apple.com")!,
        isLoading: .constant(false),
        progress: .constant(1.0)
    )
}
