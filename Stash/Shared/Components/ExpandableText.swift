import SwiftUI

/// Expandable Text - Summary text with "Read more" expansion
struct ExpandableText: View {
    let text: String
    let lineLimit: Int

    @State private var expanded = false
    @State private var isTruncated = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(text)
                .font(StashTypography.body)
                .foregroundColor(StashTheme.Color.textSecondary)
                .lineLimit(expanded ? nil : lineLimit)
                .background(
                    // Hidden text to measure if truncation is needed
                    Text(text)
                        .font(StashTypography.body)
                        .lineLimit(lineLimit)
                        .background(GeometryReader { geometry in
                            Color.clear.onAppear {
                                let fullHeight = text.heightWithConstrainedWidth(
                                    width: geometry.size.width,
                                    font: UIFont.systemFont(ofSize: 15)
                                )
                                let limitedHeight = geometry.size.height
                                isTruncated = fullHeight > limitedHeight
                            }
                        })
                        .hidden()
                )

            if isTruncated {
                Button(action: {
                    withAnimation(.easeInOut(duration: StashTheme.Motion.medium)) {
                        expanded.toggle()
                    }
                }) {
                    Text(expanded ? "Read less" : "Read more")
                        .font(StashTypography.body)
                        .foregroundColor(StashTheme.Color.accent)
                }
            }
        }
    }
}

// Helper extension to calculate text height
extension String {
    func heightWithConstrainedWidth(width: CGFloat, font: UIFont) -> CGFloat {
        let constraintRect = CGSize(width: width, height: .greatestFiniteMagnitude)
        let boundingBox = self.boundingRect(
            with: constraintRect,
            options: [.usesLineFragmentOrigin, .usesFontLeading],
            attributes: [.font: font],
            context: nil
        )
        return ceil(boundingBox.height)
    }
}

#Preview {
    VStack(spacing: 20) {
        ExpandableText(
            text: "This is a short summary that won't be truncated.",
            lineLimit: 4
        )

        ExpandableText(
            text: "This is a much longer summary that will definitely be truncated after four lines. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
            lineLimit: 4
        )
    }
    .padding()
    .background(StashTheme.Color.bg)
}
