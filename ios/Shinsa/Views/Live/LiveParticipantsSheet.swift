import SwiftUI

struct LiveParticipantsSheet: View {
    let session: LiveSession
    let onDismiss: () -> Void

    private var host: (String?, String?) {
        (session.hostUsername, session.hostAvatar)
    }

    private var participants: [LiveParticipant] {
        session.participants ?? []
    }

    private var activeParticipants: [LiveParticipant] {
        participants.filter { $0.status == "active" && $0.role != "owner" }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                DojoTheme.piuBg.ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        // Viewer stats
                        HStack(spacing: 16) {
                            VStack(spacing: 2) {
                                Text("\(session.viewerCount ?? 0)")
                                    .font(.system(size: 22, weight: .black))
                                    .foregroundColor(.white)
                                Text("Viewers")
                                    .font(.system(size: 10))
                                    .foregroundColor(DojoTheme.textMuted)
                            }
                            if let peak = session.viewerPeak, peak > 0 {
                                VStack(spacing: 2) {
                                    Text("\(peak)")
                                        .font(.system(size: 22, weight: .black))
                                        .foregroundColor(.orange)
                                    Text("Peak")
                                        .font(.system(size: 10))
                                        .foregroundColor(DojoTheme.textMuted)
                                }
                            }
                            Spacer()
                        }

                        // Host
                        sectionLabel("HOST")
                        participantRow(name: session.hostUsername ?? "Host", avatar: session.hostAvatar, role: "owner")

                        // Co-hosts
                        if let cohosts = session.cohosts, !cohosts.isEmpty {
                            sectionLabel("CO-HOSTS")
                            ForEach(cohosts) { cohost in
                                participantRow(name: cohost.username ?? "?", avatar: cohost.avatar, role: "cohost")
                            }
                        }

                        // Active participants
                        if !activeParticipants.isEmpty {
                            sectionLabel("VIEWERS (\(activeParticipants.count))")
                            ForEach(activeParticipants) { p in
                                participantRow(name: p.username ?? "?", avatar: p.avatar, role: nil)
                            }
                        }
                    }
                    .padding(16)
                }
            }
            .navigationTitle("Participants")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { onDismiss() }
                        .foregroundColor(DojoTheme.piuAccent)
                }
            }
        }
    }

    private func sectionLabel(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 9, weight: .bold))
            .foregroundColor(DojoTheme.textMuted)
            .tracking(1)
    }

    private func participantRow(name: String, avatar: String?, role: String?) -> some View {
        HStack(spacing: 10) {
            AvatarView(avatar, name: name, size: 36)
                .clipShape(Circle())

            Text(name)
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(.white)

            if let role = role {
                Text(role == "owner" ? "Host" : "Co-host")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundColor(role == "owner" ? .red : DojoTheme.piuAccent)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background((role == "owner" ? Color.red : DojoTheme.piuAccent).opacity(0.15))
                    .cornerRadius(4)
            }

            Spacer()
        }
        .padding(.vertical, 4)
    }
}
