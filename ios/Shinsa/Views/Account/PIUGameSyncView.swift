import SwiftUI

struct PIUGameSyncView: View {
    @EnvironmentObject var auth: AuthManager
    @State private var username = ""
    @State private var password = ""
    @State private var isLinked = false
    @State private var linkedUsername: String?
    @State private var isLoading = true
    @State private var isSaving = false
    @State private var isUnlinking = false
    @State private var errorMessage: String?
    @State private var successMessage: String?

    // Sync states
    @State private var syncStatus: PiugameSyncStatus?
    @State private var syncingPumbility = false
    @State private var syncingBestScores = false
    @State private var syncingRecent = false
    @State private var syncProgress: SyncProgressResponse?
    @State private var progressTimer: Task<Void, Never>?

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 16) {
                    // Header
                    VStack(spacing: 8) {
                        Image(systemName: "gamecontroller.fill")
                            .font(.system(size: 32))
                            .foregroundColor(DojoTheme.piuAccent)
                        Text("PIUGame Integration")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundColor(.white)
                        Text("Link your piugame.com account to sync scores")
                            .font(.system(size: 12))
                            .foregroundColor(DojoTheme.textMuted)
                            .multilineTextAlignment(.center)
                    }
                    .padding()
                    .frame(maxWidth: .infinity)
                    .background(DojoTheme.piuCard)
                    .cornerRadius(12)

                    if isLoading {
                        ProgressView()
                            .tint(DojoTheme.piuAccent)
                            .frame(height: 100)
                    } else if isLinked {
                        linkedSection
                        syncSection
                    } else {
                        credentialsSection
                    }

                    // Messages
                    if let err = errorMessage {
                        Text(err)
                            .font(.system(size: 12))
                            .foregroundColor(.red)
                            .padding(.horizontal)
                    }
                    if let msg = successMessage {
                        Text(msg)
                            .font(.system(size: 12))
                            .foregroundColor(DojoTheme.piuGreen)
                            .padding(.horizontal)
                    }
                }
                .padding()
            }
        }
        .navigationTitle("PIUGame Sync")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadStatus() }
        .onDisappear { progressTimer?.cancel() }
    }

    // MARK: - Credentials Section

    private var credentialsSection: some View {
        VStack(spacing: 12) {
            Text("LINK ACCOUNT")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(DojoTheme.piuAccent)
                .frame(maxWidth: .infinity, alignment: .leading)

            VStack(spacing: 10) {
                HStack(spacing: 10) {
                    Image(systemName: "person")
                        .foregroundColor(DojoTheme.textMuted)
                        .frame(width: 20)
                    TextField("PIUGame Username", text: $username)
                        .font(.system(size: 14))
                        .foregroundColor(.white)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                }
                .padding(12)
                .background(DojoTheme.piuDark)
                .cornerRadius(8)

                HStack(spacing: 10) {
                    Image(systemName: "lock")
                        .foregroundColor(DojoTheme.textMuted)
                        .frame(width: 20)
                    SecureField("PIUGame Password", text: $password)
                        .font(.system(size: 14))
                        .foregroundColor(.white)
                }
                .padding(12)
                .background(DojoTheme.piuDark)
                .cornerRadius(8)
            }

            Text("Credentials are stored securely and only used to sync your scores.")
                .font(.system(size: 11))
                .foregroundColor(DojoTheme.textMuted)

            Button {
                Task { await linkAccount() }
            } label: {
                HStack(spacing: 6) {
                    if isSaving {
                        ProgressView().tint(.white).scaleEffect(0.8)
                    }
                    Image(systemName: "link")
                    Text("Link Account")
                        .font(.system(size: 15, weight: .bold))
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 13)
                .background(DojoTheme.piuAccent)
                .cornerRadius(10)
            }
            .disabled(username.isEmpty || password.isEmpty || isSaving)
            .opacity(username.isEmpty || password.isEmpty ? 0.5 : 1)
        }
        .padding(14)
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
    }

    // MARK: - Linked Section

    private var linkedSection: some View {
        VStack(spacing: 10) {
            HStack(spacing: 10) {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundColor(DojoTheme.piuGreen)
                    .font(.system(size: 20))

                VStack(alignment: .leading, spacing: 2) {
                    Text("Account Linked")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.white)
                    if let name = linkedUsername {
                        Text(name)
                            .font(.system(size: 12))
                            .foregroundColor(DojoTheme.textMuted)
                    }
                }

                Spacer()

                Button {
                    Task { await unlinkAccount() }
                } label: {
                    if isUnlinking {
                        ProgressView().tint(.red).scaleEffect(0.7)
                    } else {
                        Text("Unlink")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(.red)
                    }
                }
                .disabled(isUnlinking)
            }
        }
        .padding(14)
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
    }

    // MARK: - Sync Section

    private var syncSection: some View {
        VStack(spacing: 12) {
            Text("SYNC DATA")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(DojoTheme.piuAccent)
                .frame(maxWidth: .infinity, alignment: .leading)

            // Pumbility
            syncRow(
                icon: "star.fill",
                title: "Pumbility",
                subtitle: syncStatus?.pumbilityValue.map { "Current: \($0)" } ?? nil,
                lastSync: syncStatus?.lastPumbilitySync,
                isSyncing: syncingPumbility
            ) {
                await syncPumbility()
            }

            // Best Scores
            syncRow(
                icon: "trophy.fill",
                title: "Best Scores",
                subtitle: syncStatus?.bestScoresImported.map { "\($0) scores imported" } ?? nil,
                lastSync: syncStatus?.lastBestScoresSync,
                isSyncing: syncingBestScores
            ) {
                await syncBestScores()
            }

            // Recently Played
            syncRow(
                icon: "clock.fill",
                title: "Recently Played",
                subtitle: nil,
                lastSync: syncStatus?.lastRecentlyPlayedSync,
                isSyncing: syncingRecent
            ) {
                await syncRecentlyPlayed()
            }

            // Sync progress indicator
            if let progress = syncProgress, progress.syncInProgress != nil {
                VStack(spacing: 6) {
                    HStack {
                        Text("Syncing: \(progress.syncInProgress ?? "")")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(DojoTheme.piuBlue)
                        Spacer()
                        if let current = progress.syncProgress, let total = progress.syncTotal, total > 0 {
                            Text("\(current)/\(total)")
                                .font(.system(size: 11))
                                .foregroundColor(DojoTheme.textMuted)
                        }
                    }

                    if let current = progress.syncProgress, let total = progress.syncTotal, total > 0 {
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                RoundedRectangle(cornerRadius: 3)
                                    .fill(DojoTheme.piuDark)
                                    .frame(height: 6)
                                RoundedRectangle(cornerRadius: 3)
                                    .fill(DojoTheme.piuAccent)
                                    .frame(width: geo.size.width * CGFloat(current) / CGFloat(total), height: 6)
                            }
                        }
                        .frame(height: 6)
                    }
                }
                .padding(10)
                .background(DojoTheme.piuDark)
                .cornerRadius(8)
            }
        }
        .padding(14)
        .background(DojoTheme.piuCard)
        .cornerRadius(12)
    }

    private func syncRow(icon: String, title: String, subtitle: String?, lastSync: String?, isSyncing: Bool, action: @escaping () async -> Void) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 14))
                .foregroundColor(DojoTheme.piuGold)
                .frame(width: 24)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.white)

                if let sub = subtitle {
                    Text(sub)
                        .font(.system(size: 11))
                        .foregroundColor(DojoTheme.textMuted)
                }

                if let last = lastSync {
                    Text("Last: \(last.timeAgo)")
                        .font(.system(size: 10))
                        .foregroundColor(DojoTheme.textMuted.opacity(0.7))
                }
            }

            Spacer()

            Button {
                Task { await action() }
            } label: {
                if isSyncing {
                    ProgressView()
                        .tint(DojoTheme.piuAccent)
                        .scaleEffect(0.7)
                } else {
                    Image(systemName: "arrow.triangle.2.circlepath")
                        .font(.system(size: 14))
                        .foregroundColor(DojoTheme.piuAccent)
                }
            }
            .disabled(isSyncing || syncingPumbility || syncingBestScores || syncingRecent)
        }
        .padding(10)
        .background(DojoTheme.piuDark)
        .cornerRadius(8)
    }

    // MARK: - Actions

    private func loadStatus() async {
        isLoading = true
        do {
            let status = try await APIService.shared.getPiugameCredentialStatus()
            isLinked = status.linked
            linkedUsername = status.username
            if isLinked {
                syncStatus = try? await APIService.shared.getPiugameSyncStatus(auth.userId)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func linkAccount() async {
        isSaving = true
        errorMessage = nil
        successMessage = nil
        do {
            _ = try await APIService.shared.savePiugameCredentials(username: username, password: password)
            isLinked = true
            linkedUsername = username
            username = ""
            password = ""
            successMessage = "Account linked successfully"
        } catch {
            errorMessage = error.localizedDescription
        }
        isSaving = false
    }

    private func unlinkAccount() async {
        isUnlinking = true
        errorMessage = nil
        do {
            _ = try await APIService.shared.deletePiugameCredentials()
            isLinked = false
            linkedUsername = nil
            syncStatus = nil
            successMessage = "Account unlinked"
        } catch {
            errorMessage = error.localizedDescription
        }
        isUnlinking = false
    }

    private func syncPumbility() async {
        syncingPumbility = true
        errorMessage = nil
        successMessage = nil
        do {
            let data = try await APIService.shared.syncPumbility()
            if let val = data.pumbilityValue {
                syncStatus?.pumbilityValue = val
            }
            successMessage = "Pumbility synced"
        } catch {
            errorMessage = error.localizedDescription
        }
        syncingPumbility = false
    }

    private func syncBestScores() async {
        syncingBestScores = true
        errorMessage = nil
        successMessage = nil
        startProgressPolling()
        do {
            _ = try await APIService.shared.syncBestScores()
            successMessage = "Best scores synced"
        } catch {
            errorMessage = error.localizedDescription
        }
        syncingBestScores = false
        stopProgressPolling()
    }

    private func syncRecentlyPlayed() async {
        syncingRecent = true
        errorMessage = nil
        successMessage = nil
        startProgressPolling()
        do {
            _ = try await APIService.shared.syncRecentlyPlayed()
            successMessage = "Recently played synced"
        } catch {
            errorMessage = error.localizedDescription
        }
        syncingRecent = false
        stopProgressPolling()
    }

    private func startProgressPolling() {
        progressTimer?.cancel()
        progressTimer = Task {
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                guard !Task.isCancelled else { break }
                syncProgress = try? await APIService.shared.getSyncProgress()
            }
        }
    }

    private func stopProgressPolling() {
        progressTimer?.cancel()
        progressTimer = nil
        syncProgress = nil
    }
}
