import SwiftUI
import CoreImage
import CoreImage.CIFilterBuiltins

struct QRLoginApproveView: View {
    @EnvironmentObject var auth: AuthManager
    @Environment(\.dismiss) var dismiss

    @State private var challengeId: String?
    @State private var challengeToken: String?
    @State private var isLoading = true
    @State private var isApproved = false
    @State private var errorMessage: String?
    @State private var timeRemaining = 300 // 5 minutes
    @State private var pollTimer: Timer?
    @State private var countdownTimer: Timer?

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            VStack(spacing: 24) {
                if isApproved {
                    approvedSection
                } else if isLoading {
                    ProgressView()
                        .tint(DojoTheme.piuAccent)
                    Text("Generating QR code...")
                        .font(.system(size: 13))
                        .foregroundColor(DojoTheme.textMuted)
                } else if let error = errorMessage {
                    errorSection(error)
                } else {
                    qrCodeSection
                }
            }
            .padding()
        }
        .navigationTitle("QR Login")
        .navigationBarTitleDisplayMode(.inline)
        .task { await createChallenge() }
        .onDisappear { stopTimers() }
    }

    // MARK: - QR Code Section

    private var qrCodeSection: some View {
        VStack(spacing: 20) {
            Text("SCAN TO LOGIN")
                .font(.system(size: 18, weight: .bold))
                .foregroundColor(.white)

            Text("Open Shinsa on another device and scan this code to log in")
                .font(.system(size: 13))
                .foregroundColor(DojoTheme.textMuted)
                .multilineTextAlignment(.center)

            // QR Code
            if let token = challengeToken {
                qrCodeImage(for: token)
                    .interpolation(.none)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 220, height: 220)
                    .padding(16)
                    .background(Color.white)
                    .cornerRadius(16)
            }

            // Timer
            HStack(spacing: 6) {
                Image(systemName: "clock")
                    .font(.system(size: 12))
                Text("Expires in \(formattedTime)")
                    .font(.system(size: 13, weight: .medium))
            }
            .foregroundColor(timeRemaining <= 60 ? DojoTheme.piuAccent : DojoTheme.textMuted)

            // Progress bar
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(DojoTheme.piuBorder)
                        .frame(height: 4)

                    RoundedRectangle(cornerRadius: 2)
                        .fill(timeRemaining <= 60 ? DojoTheme.piuAccent : DojoTheme.piuGreen)
                        .frame(width: geo.size.width * CGFloat(timeRemaining) / 300.0, height: 4)
                }
            }
            .frame(height: 4)
            .padding(.horizontal, 40)

            Text("Waiting for approval...")
                .font(.system(size: 12))
                .foregroundColor(DojoTheme.textMuted)
                .italic()

            // Refresh button
            Button {
                Task { await createChallenge() }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "arrow.clockwise")
                    Text("Generate New Code")
                }
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(DojoTheme.piuAccent)
                .padding(.horizontal, 20)
                .padding(.vertical, 10)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(DojoTheme.piuAccent.opacity(0.5), lineWidth: 1)
                )
            }
        }
    }

    // MARK: - Approved Section

    private var approvedSection: some View {
        VStack(spacing: 16) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 64))
                .foregroundColor(DojoTheme.piuGreen)

            Text("LOGIN APPROVED")
                .font(.system(size: 20, weight: .bold))
                .foregroundColor(.white)

            Text("The other device has been logged in successfully")
                .font(.system(size: 13))
                .foregroundColor(DojoTheme.textMuted)
                .multilineTextAlignment(.center)

            Button {
                dismiss()
            } label: {
                Text("Done")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(DojoTheme.piuAccent)
                    .cornerRadius(12)
            }
            .padding(.top, 8)
        }
    }

    // MARK: - Error Section

    private func errorSection(_ message: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 40))
                .foregroundColor(DojoTheme.piuGold)

            Text("Error")
                .font(.system(size: 18, weight: .bold))
                .foregroundColor(.white)

            Text(message)
                .font(.system(size: 13))
                .foregroundColor(DojoTheme.textMuted)
                .multilineTextAlignment(.center)

            Button {
                Task { await createChallenge() }
            } label: {
                Text("Try Again")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(DojoTheme.piuAccent)
                    .cornerRadius(12)
            }
        }
    }

    // MARK: - Helpers

    private var formattedTime: String {
        let minutes = timeRemaining / 60
        let seconds = timeRemaining % 60
        return String(format: "%d:%02d", minutes, seconds)
    }

    private func qrCodeImage(for string: String) -> Image {
        let data = Data(string.utf8)
        guard let filter = CIFilter(name: "CIQRCodeGenerator") else {
            return Image(systemName: "qrcode")
        }
        filter.setValue(data, forKey: "inputMessage")
        filter.setValue("M", forKey: "inputCorrectionLevel")

        guard let output = filter.outputImage else {
            return Image(systemName: "qrcode")
        }

        let transform = CGAffineTransform(scaleX: 10, y: 10)
        let scaled = output.transformed(by: transform)

        let context = CIContext()
        guard let cgImage = context.createCGImage(scaled, from: scaled.extent) else {
            return Image(systemName: "qrcode")
        }

        return Image(uiImage: UIImage(cgImage: cgImage))
    }

    // MARK: - API

    private func createChallenge() async {
        stopTimers()
        isLoading = true
        isApproved = false
        errorMessage = nil
        timeRemaining = 300

        do {
            let response = try await APIService.shared.createQRLoginChallenge()
            challengeId = response["challengeId"]?.value as? String
            challengeToken = (response["token"]?.value as? String) ?? (response["challengeId"]?.value as? String)

            guard let id = challengeId else {
                errorMessage = "Failed to create login challenge"
                isLoading = false
                return
            }

            isLoading = false
            startPolling(id)
            startCountdown()
        } catch {
            errorMessage = error.localizedDescription
            isLoading = false
        }
    }

    private func startPolling(_ id: String) {
        pollTimer = Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { _ in
            Task { @MainActor in
                await pollForApproval(id)
            }
        }
    }

    private func startCountdown() {
        countdownTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
            Task { @MainActor in
                if timeRemaining > 0 {
                    timeRemaining -= 1
                } else {
                    stopTimers()
                    errorMessage = "QR code expired. Generate a new one."
                }
            }
        }
    }

    private func pollForApproval(_ id: String) async {
        do {
            let response = try await APIService.shared.pollQRLogin(id)
            let status = response["status"]?.value as? String
            if status == "approved" || status == "completed" {
                stopTimers()
                withAnimation { isApproved = true }
                HapticService.pump()
            }
        } catch {
            // Silently continue polling
        }
    }

    private func stopTimers() {
        pollTimer?.invalidate()
        pollTimer = nil
        countdownTimer?.invalidate()
        countdownTimer = nil
    }
}
