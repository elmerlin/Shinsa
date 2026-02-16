import SwiftUI

struct NotificationsView: View {
    @EnvironmentObject var poller: NotificationPoller
    @State private var notifications: [AppNotification] = []
    @State private var invitations: [Invitation] = []
    @State private var isLoading = false

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 12) {
                    // Invitations
                    if !invitations.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("INVITATIONS")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundColor(DojoTheme.piuGold)

                            ForEach(invitations) { inv in
                                InvitationCardView(invitation: inv) {
                                    await loadData()
                                }
                            }
                        }
                    }

                    // Notifications
                    if notifications.isEmpty && !isLoading {
                        Text("No notifications yet")
                            .foregroundColor(DojoTheme.textMuted)
                            .padding(.vertical, 40)
                    }

                    ForEach(notifications) { notif in
                        notificationRow(notif)
                    }
                }
                .padding()
            }
            .refreshable { await loadData() }
        }
        .navigationTitle("Notifications")
        .task { await loadData() }
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button("Read All") {
                    Task { await markAllRead() }
                }
                .font(.system(size: 13))
                .foregroundColor(DojoTheme.piuAccent)
            }
        }
    }

    private func notificationRow(_ notif: AppNotification) -> some View {
        HStack(spacing: 10) {
            Circle()
                .fill(notif.isRead ? Color.clear : DojoTheme.piuAccent)
                .frame(width: 8, height: 8)

            Image(systemName: notifIcon(notif.type))
                .foregroundColor(DojoTheme.piuAccent)
                .frame(width: 24)

            VStack(alignment: .leading, spacing: 2) {
                Text(notif.message ?? "Notification")
                    .font(.system(size: 13))
                    .foregroundColor(.white)
                if let created = notif.createdAt {
                    Text(created.timeAgo)
                        .font(.system(size: 11))
                        .foregroundColor(DojoTheme.textMuted)
                }
            }

            Spacer()
        }
        .padding(12)
        .background(notif.isRead ? DojoTheme.piuCard : DojoTheme.piuCard.opacity(0.8))
        .cornerRadius(8)
        .onTapGesture {
            Task {
                try? await APIService.shared.markNotificationRead(notif.id)
                await loadData()
            }
        }
    }

    private func notifIcon(_ type: String?) -> String {
        switch type {
        case "follow": return "person.badge.plus"
        case "pump": return "heart.fill"
        case "comment": return "bubble.left"
        case "reply": return "arrowshape.turn.up.left"
        case "invitation": return "envelope"
        default: return "bell"
        }
    }

    private func loadData() async {
        isLoading = true
        notifications = (try? await APIService.shared.getNotifications().notifications) ?? []
        invitations = (try? await APIService.shared.getInvitations()) ?? []
        isLoading = false
    }

    private func markAllRead() async {
        try? await APIService.shared.markAllNotificationsRead()
        await loadData()
        poller.unreadCount = 0
    }
}

struct InvitationCardView: View {
    let invitation: Invitation
    let onRespond: () async -> Void

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "envelope.badge")
                .foregroundColor(DojoTheme.piuGold)

            VStack(alignment: .leading, spacing: 2) {
                Text(invitation.tournamentName ?? invitation.duelName ?? "You have been invited")
                    .font(.system(size: 13))
                    .foregroundColor(.white)
                if let created = invitation.createdAt {
                    Text(created.timeAgo)
                        .font(.system(size: 11))
                        .foregroundColor(DojoTheme.textMuted)
                }
            }

            Spacer()

            if invitation.status == "pending" {
                HStack(spacing: 6) {
                    Button {
                        Task {
                            try? await APIService.shared.respondInvitation(invitation.id, status: "accepted")
                            await onRespond()
                        }
                    } label: {
                        Text("Accept")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(DojoTheme.piuGreen)
                            .cornerRadius(6)
                    }

                    Button {
                        Task {
                            try? await APIService.shared.respondInvitation(invitation.id, status: "declined")
                            await onRespond()
                        }
                    } label: {
                        Text("Decline")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(DojoTheme.piuAccent)
                            .cornerRadius(6)
                    }
                }
            }
        }
        .padding(12)
        .background(DojoTheme.piuCard)
        .cornerRadius(8)
    }
}
