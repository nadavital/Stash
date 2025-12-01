import SwiftUI

/// Metadata Row - Consistent metadata display across all detail views
struct MetadataRow: View {
    let items: [String]

    var body: some View {
        Text(formattedMetadata)
            .font(StashTypography.meta)
            .foregroundColor(StashTheme.Color.textSecondary)
            .tracking(0.5)
    }

    private var formattedMetadata: String {
        items.joined(separator: " · ")
    }
}

#Preview {
    VStack(alignment: .leading, spacing: 12) {
        MetadataRow(items: ["Shared by @alex", "15 min read", "2 days ago"])

        MetadataRow(items: ["Artist Name", "Album Name", "2024"])

        MetadataRow(items: ["30 min cook time", "4 servings"])

        MetadataRow(items: ["Jun 10, 2025", "San Jose, CA"])
    }
    .padding()
    .background(StashTheme.Color.bg)
}
