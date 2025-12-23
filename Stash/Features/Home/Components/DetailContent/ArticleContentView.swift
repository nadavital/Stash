import SwiftUI
import WebKit

/// Article detail view with WebView for full content consumption
struct ArticleContentView: View {
    let item: ItemSummary

    var body: some View {
        if let url = item.canonicalUrl, let webUrl = URL(string: url) {
            ContentWebView(url: webUrl)
                .frame(minHeight: 800)
                .clipShape(RoundedRectangle(cornerRadius: 12))
        } else {
            // No URL available
            Text("No URL available for this article")
                .font(.system(size: 15))
                .foregroundStyle(.white.opacity(0.5))
                .padding()
                .frame(maxWidth: .infinity)
                .background(.white.opacity(0.05))
                .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }
}

// MARK: - Content WebView

/// WebView wrapper for displaying web content
struct ContentWebView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.backgroundColor = .black
        webView.isOpaque = false
        webView.scrollView.backgroundColor = .black

        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        let request = URLRequest(url: url)
        webView.load(request)
    }
}
