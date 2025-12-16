import SwiftUI

/// Glass pill showing attribution for shared items or AI recommendations
/// Examples: "from Sarah", "Picked for you"
struct AttributionPill: View {
    enum AttributionType {
        case friend(name: String)
        case aiRecommendation

        var text: String {
            switch self {
            case .friend(let name):
                return "from \(name)"
            case .aiRecommendation:
                return "Picked for you"
            }
        }

        var icon: String? {
            switch self {
            case .friend:
                return nil
            case .aiRecommendation:
                return "sparkles"
            }
        }
    }

    let type: AttributionType
    let onTap: (() -> Void)?

    init(type: AttributionType, onTap: (() -> Void)? = nil) {
        self.type = type
        self.onTap = onTap
    }

    var body: some View {
        Button {
            Haptics.light()
            onTap?()
        } label: {
            HStack(spacing: 6) {
                if let icon = type.icon {
                    Image(systemName: icon)
                        .font(.system(size: 11, weight: .medium))
                }
                Text(type.text)
                    .font(.system(size: 12, weight: .medium))
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .glassEffect()
        }
        .buttonStyle(.plain)
        .disabled(onTap == nil)
    }
}

// MARK: - Preview

#Preview("Friend Attribution") {
    ZStack {
        Color.black
        VStack(spacing: 16) {
            AttributionPill(type: .friend(name: "Sarah")) {
                print("Tapped Sarah pill")
            }

            AttributionPill(type: .friend(name: "Jake")) {
                print("Tapped Jake pill")
            }

            AttributionPill(type: .aiRecommendation)
        }
    }
}

#Preview("AI Recommendation") {
    ZStack {
        LinearGradient(
            colors: [.blue, .purple],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        AttributionPill(type: .aiRecommendation)
    }
}
