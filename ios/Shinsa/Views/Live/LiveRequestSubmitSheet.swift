import SwiftUI

struct LiveRequestSubmitSheet: View {
    let sessionId: String
    @ObservedObject var vm: LiveViewModel
    let onDismiss: () -> Void

    @State private var query = ""
    @State private var searchTask: Task<Void, Never>?

    var body: some View {
        NavigationStack {
            ZStack {
                DojoTheme.piuBg.ignoresSafeArea()

                VStack(spacing: 0) {
                    // Search bar
                    HStack(spacing: 8) {
                        Image(systemName: "magnifyingglass")
                            .font(.system(size: 14))
                            .foregroundColor(DojoTheme.textMuted)
                        TextField("Search songs...", text: $query)
                            .font(.system(size: 14))
                            .foregroundColor(.white)
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                        if vm.isSearchingSongs {
                            ProgressView().tint(DojoTheme.piuAccent).scaleEffect(0.7)
                        }
                    }
                    .padding(10)
                    .background(DojoTheme.piuCard)
                    .cornerRadius(10)
                    .padding(.horizontal)
                    .padding(.top, 8)

                    // Results
                    if !vm.songSearchResults.isEmpty {
                        ScrollView {
                            LazyVStack(spacing: 6) {
                                ForEach(vm.songSearchResults) { song in
                                    songResultRow(song)
                                }
                            }
                            .padding()
                        }
                    } else if query.count >= 2 && !vm.isSearchingSongs {
                        Spacer()
                        Text("No songs found")
                            .font(.system(size: 13))
                            .foregroundColor(DojoTheme.textMuted)
                        Spacer()
                    } else {
                        Spacer()
                        VStack(spacing: 8) {
                            Image(systemName: "music.note")
                                .font(.system(size: 28))
                                .foregroundColor(DojoTheme.textMuted.opacity(0.4))
                            Text("Search for a song to request")
                                .font(.system(size: 13))
                                .foregroundColor(DojoTheme.textMuted)
                        }
                        Spacer()
                    }
                }
            }
            .navigationTitle("Request a Song")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Cancel") { onDismiss() }
                        .foregroundColor(DojoTheme.piuAccent)
                }
            }
            .onChange(of: query) { q in
                searchTask?.cancel()
                searchTask = Task {
                    try? await Task.sleep(nanoseconds: 300_000_000)
                    guard !Task.isCancelled else { return }
                    await vm.searchSongs(q)
                }
            }
        }
    }

    private func songResultRow(_ song: Song) -> some View {
        let isDouble = song.isDouble
        let jacketURL = JacketService.shared.resolveJacketURL(
            title: song.title, mode: song.mode, level: song.level,
            backgroundUrl: song.jacketUrl
        )

        return Button {
            Task {
                await vm.submitRequest(sessionId, songTitle: song.title, mode: song.mode, level: song.level)
                onDismiss()
            }
        } label: {
            HStack(spacing: 10) {
                if let url = jacketURL {
                    AsyncImage(url: url) { phase in
                        if case .success(let img) = phase {
                            img.resizable().scaledToFill()
                        } else {
                            RoundedRectangle(cornerRadius: 6).fill(DojoTheme.piuCard)
                        }
                    }
                    .frame(width: 44, height: 28)
                    .cornerRadius(6)
                    .clipped()
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(song.title)
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.white)
                        .lineLimit(1)

                    Text(song.levelBadge)
                        .font(.system(size: 9, weight: .black))
                        .foregroundColor(.white)
                        .padding(.horizontal, 4)
                        .padding(.vertical, 1)
                        .background(isDouble ? Color(hex: "#0b5d48") : Color(hex: "#7a1730"))
                        .cornerRadius(3)
                }

                Spacer()

                Image(systemName: "plus.circle.fill")
                    .font(.system(size: 18))
                    .foregroundColor(.cyan)
            }
            .padding(10)
            .background(DojoTheme.piuCard)
            .cornerRadius(8)
        }
    }
}
