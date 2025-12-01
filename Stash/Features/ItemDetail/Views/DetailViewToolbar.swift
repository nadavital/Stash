import SwiftUI

/// Reusable toolbar for detail views
struct DetailViewToolbar: ToolbarContent {
    let onLike: () -> Void
    let onShare: () -> Void
    let onDone: () -> Void
    let onDelete: () -> Void

    var body: some ToolbarContent {
        ToolbarItemGroup(placement: .bottomBar) {
            Button(action: onLike) {
                VStack(spacing: 4) {
                    Image(systemName: "heart")
                        .font(.title3)
                    Text("Like")
                        .font(.caption)
                }
            }
            .foregroundColor(StashTheme.Color.textPrimary)

            Spacer()

            Button(action: onShare) {
                VStack(spacing: 4) {
                    Image(systemName: "person.badge.plus")
                        .font(.title3)
                    Text("Share")
                        .font(.caption)
                }
            }
            .foregroundColor(StashTheme.Color.textPrimary)

            Spacer()

            Button(action: onDone) {
                VStack(spacing: 4) {
                    Image(systemName: "checkmark.circle")
                        .font(.title3)
                    Text("Done")
                        .font(.caption)
                }
            }
            .foregroundColor(StashTheme.Color.accent)

            Spacer()

            Button(role: .destructive, action: onDelete) {
                VStack(spacing: 4) {
                    Image(systemName: "trash")
                        .font(.title3)
                    Text("Delete")
                        .font(.caption)
                }
            }
            .foregroundColor(StashTheme.Color.danger)
        }
    }
}
