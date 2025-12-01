import SwiftUI

/// A label showing the source of an item (FROM YOU, FROM FRIEND, FOR YOU)
struct SourceLabel: View {
    let label: String

    var body: some View {
        Text(label)
            .font(StashTypography.meta)
            .foregroundColor(labelColor)
            .tracking(0.5)
    }

    private var labelColor: Color {
        switch label {
        case "FROM YOU":
            return StashTheme.Color.accent
        case "FROM FRIEND":
            return StashTheme.Color.ai
        case "FOR YOU":
            return StashTheme.Color.ai
        default:
            return StashTheme.Color.textMuted
        }
    }
}

#Preview {
    VStack(spacing: 12) {
        SourceLabel(label: "FROM YOU")
        SourceLabel(label: "FROM FRIEND")
        SourceLabel(label: "FOR YOU")
    }
    .padding()
}
