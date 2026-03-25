import SwiftUI

struct LiveChatTab: View {
    let sessionId: String
    @ObservedObject var vm: LiveViewModel
    let isHost: Bool

    @State private var showStickerTray = false

    var body: some View {
        VStack(spacing: 0) {
            // Messages
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 6) {
                        ForEach(vm.messages) { msg in
                            messageRow(msg)
                                .id(msg.id)
                        }
                    }
                    .padding(.horizontal)
                    .padding(.vertical, 8)
                }
                .onChange(of: vm.messages.count) { _ in
                    if let last = vm.messages.last {
                        withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                    }
                }
            }

            // Quick emote row
            emoteRow

            // Message input
            if vm.session?.isActive == true {
                messageInput
            }
        }
    }

    // MARK: - Message Row

    private func messageRow(_ msg: LiveMessage) -> some View {
        let msgType = msg.type ?? "message"

        return HStack(alignment: .top, spacing: 8) {
            if msgType == "system" || msgType == "play" || msgType == "request" || msgType == "vote" || msgType == "vote_result" {
                systemMessageRow(msg, type: msgType)
            } else if msgType == "emote" {
                HStack(spacing: 4) {
                    Text(msg.username ?? "")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(DojoTheme.piuAccent)
                    StickerTextView(text: msg.content ?? "", stickerSize: 28)
                }
            } else {
                // Regular message
                AvatarView(msg.avatar, name: msg.username ?? "?", size: 24)
                    .clipShape(Circle())

                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 4) {
                        Text(msg.username ?? "Unknown")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(DojoTheme.piuAccent)

                        if let ts = msg.createdAt {
                            Text(formatTime(ts))
                                .font(.system(size: 9))
                                .foregroundColor(DojoTheme.textMuted)
                        }
                    }
                    StickerTextView(text: msg.content ?? "", font: .system(size: 13), color: .white)
                }

                Spacer(minLength: 0)

                // Pump button (double-tap also works)
                if let pumpCount = msg.pumpCount, pumpCount > 0 {
                    HStack(spacing: 2) {
                        Image(systemName: "flame.fill")
                            .font(.system(size: 10))
                            .foregroundColor(DojoTheme.piuAccent)
                        Text("\(pumpCount)")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(DojoTheme.piuAccent)
                    }
                }
            }
        }
        .padding(.vertical, 2)
        .contentShape(Rectangle())
        .onTapGesture(count: 2) {
            Task { await vm.pumpMessage(sessionId, messageId: msg.id) }
            HapticService.pump()
        }
        .contextMenu {
            if isHost {
                Button(role: .destructive) {
                    Task { await vm.deleteMessage(sessionId, messageId: msg.id) }
                } label: {
                    Label("Delete", systemImage: "trash")
                }
            }
        }
    }

    private func systemMessageRow(_ msg: LiveMessage, type: String) -> some View {
        let (icon, color): (String, Color) = {
            switch type {
            case "play": return ("music.note", Color(hex: "#6ee7b7"))
            case "request": return ("list.bullet", .cyan)
            case "vote", "vote_result": return ("chart.bar", .orange)
            default: return ("info.circle", DojoTheme.piuGold)
            }
        }()

        let bgColor: Color = {
            switch type {
            case "play": return Color(hex: "#059669").opacity(0.1)
            case "request": return Color.cyan.opacity(0.1)
            case "vote", "vote_result": return Color.orange.opacity(0.1)
            default: return Color.clear
            }
        }()

        return HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 10))
                .foregroundColor(color)
            Text(msg.content ?? "")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(color)
        }
        .frame(maxWidth: .infinity, alignment: .center)
        .padding(.vertical, 4)
        .padding(.horizontal, 8)
        .background(bgColor)
        .cornerRadius(6)
    }

    // MARK: - Emote Row

    private var emoteRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                // Quick emotes
                ForEach(["🔥", "💪", "👏", "😂", "❤️", "⚡"], id: \.self) { emoji in
                    Button {
                        Task {
                            vm.messageText = emoji
                            await vm.sendMessage(sessionId)
                        }
                    } label: {
                        Text(emoji).font(.system(size: 22))
                    }
                }

                Divider().frame(height: 20)

                // Sticker tray toggle
                Button { showStickerTray.toggle() } label: {
                    Image(systemName: "face.smiling")
                        .font(.system(size: 18))
                        .foregroundColor(showStickerTray ? DojoTheme.piuAccent : DojoTheme.textMuted)
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
        }
        .background(DojoTheme.piuCard.opacity(0.5))
        .sheet(isPresented: $showStickerTray) {
            stickerTraySheet
        }
    }

    // MARK: - Sticker Tray

    private var stickerTraySheet: some View {
        NavigationStack {
            ZStack {
                DojoTheme.piuBg.ignoresSafeArea()
                ScrollView {
                    let packs = ["buu", "buuu", "dojocat", "buu_hop_sandbagging", "heavybreathing_chicken", "devit"]
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 4), spacing: 12) {
                        ForEach(1...12, id: \.self) { i in
                            ForEach(packs, id: \.self) { pack in
                                let token = ":\(pack)_\(i):"
                                if let url = StickerService.stickerURL(for: token) {
                                    Button {
                                        Task {
                                            vm.messageText = token
                                            await vm.sendMessage(sessionId)
                                            showStickerTray = false
                                        }
                                    } label: {
                                        AsyncImage(url: url) { phase in
                                            if case .success(let img) = phase {
                                                img.resizable().scaledToFit()
                                            } else {
                                                Color.clear
                                            }
                                        }
                                        .frame(width: 52, height: 52)
                                    }
                                }
                            }
                        }
                    }
                    .padding()
                }
            }
            .navigationTitle("Stickers")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { showStickerTray = false }
                        .foregroundColor(DojoTheme.piuAccent)
                }
            }
        }
        .presentationDetents([.medium])
    }

    // MARK: - Message Input

    private var messageInput: some View {
        HStack(spacing: 8) {
            TextField("Send a message...", text: $vm.messageText)
                .font(.system(size: 14))
                .foregroundColor(.white)
                .padding(10)
                .background(DojoTheme.piuCard)
                .cornerRadius(8)
                .onSubmit { Task { await vm.sendMessage(sessionId) } }

            Button {
                Task { await vm.sendMessage(sessionId) }
            } label: {
                Image(systemName: "paperplane.fill")
                    .font(.system(size: 16))
                    .foregroundColor(.white)
                    .frame(width: 40, height: 40)
                    .background(DojoTheme.piuAccent)
                    .cornerRadius(8)
            }
            .disabled(vm.messageText.trimmingCharacters(in: .whitespaces).isEmpty)
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
        .background(DojoTheme.piuDark)
    }

    // MARK: - Helpers

    private func formatTime(_ iso: String) -> String {
        // Extract HH:MM from ISO string
        if let tIndex = iso.firstIndex(of: "T") {
            let time = iso[iso.index(after: tIndex)...]
            let parts = time.prefix(5)
            return String(parts)
        }
        return ""
    }
}

// Extend LiveMessage with pump count
extension LiveMessage {
    var pumpCount: Int? {
        // Decoded from API if available
        nil // The server includes this in the message payload when pumped
    }
}
