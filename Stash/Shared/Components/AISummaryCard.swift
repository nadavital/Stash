import SwiftUI

/// AI Summary Card - The hero AI element showing intelligent summary + contextual tags
struct AISummaryCard: View {
    let summary: String
    let tags: [String]

    @State private var shimmerPhase: CGFloat = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // AI label row
            HStack(spacing: 6) {
                Image("stash-glyph")
                    .resizable()
                    .renderingMode(.template)
                    .aspectRatio(contentMode: .fit)
                    .frame(width: 16, height: 16)
                    .foregroundColor(StashTheme.Color.ai)

                Text("AI Summary")
                    .font(StashTypography.meta)
                    .foregroundColor(StashTheme.Color.ai)
                    .tracking(0.5)
            }

            // Summary text (2-4 lines)
            Text(summary)
                .font(StashTypography.body)
                .foregroundColor(StashTheme.Color.textPrimary)
                .lineLimit(4)
                .fixedSize(horizontal: false, vertical: true)

            // AI context tags
            if !tags.isEmpty {
                FlowLayout(spacing: 8) {
                    ForEach(tags, id: \.self) { tag in
                        AITagPill(text: tag)
                    }
                }
            }
        }
        .padding(16)
        .background(StashTheme.Color.surface)
        .overlay(
            RoundedRectangle(cornerRadius: StashTheme.Radius.card)
                .strokeBorder(shimmerBorder, lineWidth: 1)
        )
        .cornerRadius(StashTheme.Radius.card)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("AI Summary: \(summary)")
        .onAppear {
            if !reduceMotion {
                startShimmerAnimation()
            }
        }
    }

    // Very subtle shimmer border animation
    private var shimmerBorder: LinearGradient {
        let opacity = 0.05 + (sin(shimmerPhase * .pi * 2) * 0.035) // 0.05 → 0.085 → 0.05
        return LinearGradient(
            gradient: Gradient(colors: [
                StashTheme.Color.aiSoft.opacity(opacity),
                StashTheme.Color.aiSoft.opacity(opacity)
            ]),
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    private func startShimmerAnimation() {
        withAnimation(
            .easeInOut(duration: 5.0)
            .repeatForever(autoreverses: true)
        ) {
            shimmerPhase = 1.0
        }
    }
}

/// AI Tag Pill - Small contextual tag with AI styling
struct AITagPill: View {
    let text: String

    var body: some View {
        Text(text)
            .font(StashTypography.caption)
            .foregroundColor(StashTheme.Color.ai)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(StashTheme.Color.aiSoft)
            .cornerRadius(StashTheme.Radius.pill)
    }
}

/// Simple flow layout for wrapping tags - constrained to parent width
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        // Use proposed width, fallback to a reasonable default
        let maxWidth = proposal.width ?? UIScreen.main.bounds.width - 40
        let result = FlowResult(
            in: maxWidth,
            subviews: subviews,
            spacing: spacing
        )
        return CGSize(width: maxWidth, height: result.size.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = FlowResult(
            in: bounds.width,
            subviews: subviews,
            spacing: spacing
        )
        for (index, subview) in subviews.enumerated() {
            let size = subview.sizeThatFits(.unspecified)
            subview.place(
                at: CGPoint(x: bounds.minX + result.positions[index].x, y: bounds.minY + result.positions[index].y),
                proposal: ProposedViewSize(size)
            )
        }
    }

    struct FlowResult {
        var size: CGSize = .zero
        var positions: [CGPoint] = []

        init(in maxWidth: CGFloat, subviews: Subviews, spacing: CGFloat) {
            var x: CGFloat = 0
            var y: CGFloat = 0
            var lineHeight: CGFloat = 0

            for subview in subviews {
                let size = subview.sizeThatFits(.unspecified)
                
                // Ensure we don't exceed max width
                let itemWidth = min(size.width, maxWidth)

                if x + itemWidth > maxWidth && x > 0 {
                    x = 0
                    y += lineHeight + spacing
                    lineHeight = 0
                }

                positions.append(CGPoint(x: x, y: y))
                lineHeight = max(lineHeight, size.height)
                x += itemWidth + spacing
            }

            self.size = CGSize(width: maxWidth, height: y + lineHeight)
        }
    }
}

#Preview {
    VStack(spacing: 20) {
        AISummaryCard(
            summary: "This article explores how AI-first thinking is reshaping mobile app development with practical examples and design patterns.",
            tags: ["Good for tonight", "15 min read", "Similar to last week"]
        )
        .padding()

        AISummaryCard(
            summary: "A quick read about productivity hacks.",
            tags: ["Quick read", "5 min"]
        )
        .padding()
    }
    .background(StashTheme.Color.bg)
}
