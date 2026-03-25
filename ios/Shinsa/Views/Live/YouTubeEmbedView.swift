import SwiftUI
import WebKit

struct YouTubeEmbedView: UIViewRepresentable {
    let videoId: String

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.isScrollEnabled = false
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        let html = """
        <!DOCTYPE html>
        <html><head><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>*{margin:0;padding:0;background:#000}iframe{width:100%;height:100%;border:0}</style>
        </head><body>
        <iframe src="https://www.youtube-nocookie.com/embed/\(videoId)?playsinline=1&rel=0"
            allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture"
            allowfullscreen></iframe>
        </body></html>
        """
        webView.loadHTMLString(html, baseURL: nil)
    }
}
