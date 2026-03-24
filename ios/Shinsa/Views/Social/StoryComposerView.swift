import SwiftUI
import PhotosUI

struct StoryComposerView: View {
    let prefilledSnapshot: StorySnapshot?
    let onDismiss: () -> Void

    @State private var selectedMode = 0 // 0=text, 1=image, 2=score
    @State private var caption = ""
    @State private var textContent = ""
    @State private var selectedGradientIndex = 0
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var selectedImageData: Data?
    @State private var isPosting = false
    @State private var errorMessage: String?
    private let maxCaption = 420

    init(prefilledSnapshot: StorySnapshot? = nil, onDismiss: @escaping () -> Void) {
        self.prefilledSnapshot = prefilledSnapshot
        self.onDismiss = onDismiss
    }

    private let gradients: [(Color, Color)] = [
        (Color(hex: "#0f172a"), Color(hex: "#1e293b")),
        (Color(hex: "#312e81"), Color(hex: "#4c1d95")),
        (Color(hex: "#064e3b"), Color(hex: "#065f46")),
        (Color(hex: "#7c2d12"), Color(hex: "#9a3412")),
        (Color(hex: "#1e1b4b"), Color(hex: "#312e81")),
        (Color(hex: "#881337"), Color(hex: "#9f1239")),
    ]

    var body: some View {
        NavigationStack {
            ZStack {
                DojoTheme.piuBg.ignoresSafeArea()

                VStack(spacing: 16) {
                    // Mode selector
                    if prefilledSnapshot == nil {
                        Picker("Mode", selection: $selectedMode) {
                            Text("Text").tag(0)
                            Text("Image").tag(1)
                        }
                        .pickerStyle(.segmented)
                        .padding(.horizontal, 16)
                    }

                    // Preview area
                    ZStack {
                        if prefilledSnapshot != nil {
                            scorePreview
                        } else if selectedMode == 0 {
                            textPreview
                        } else {
                            imagePreview
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 400)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                    .padding(.horizontal, 16)

                    // Caption
                    VStack(alignment: .leading, spacing: 4) {
                        TextField("Add a caption...", text: $caption, axis: .vertical)
                            .foregroundColor(.white)
                            .font(.system(size: 14))
                            .lineLimit(3)
                            .padding(12)
                            .background(
                                RoundedRectangle(cornerRadius: 10)
                                    .fill(Color.white.opacity(0.06))
                            )
                            .onChange(of: caption) { newValue in
                                if newValue.count > maxCaption { caption = String(newValue.prefix(maxCaption)) }
                            }

                        HStack {
                            Spacer()
                            Text("\(caption.count)/\(maxCaption)")
                                .font(.system(size: 10))
                                .foregroundColor(DojoTheme.textMuted)
                        }
                    }
                    .padding(.horizontal, 16)

                    if let err = errorMessage {
                        Text(err).font(.system(size: 12)).foregroundColor(.red).padding(.horizontal, 16)
                    }

                    Spacer()

                    // Post button
                    Button {
                        Task { await postStory() }
                    } label: {
                        Text(isPosting ? "Posting..." : "Post to Story")
                            .font(.system(size: 16, weight: .black))
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(
                                RoundedRectangle(cornerRadius: 12)
                                    .fill(DojoTheme.piuAccent)
                            )
                    }
                    .disabled(isPosting || !canPost)
                    .opacity(canPost ? 1 : 0.5)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 16)
                }
            }
            .navigationTitle("New Story")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button { onDismiss() } label: {
                        Image(systemName: "xmark")
                            .foregroundColor(.white)
                    }
                }
            }
        }
    }

    private var canPost: Bool {
        if prefilledSnapshot != nil { return true }
        if selectedMode == 0 { return !textContent.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        if selectedMode == 1 { return selectedImageData != nil }
        return false
    }

    // MARK: - Text Preview

    private var textPreview: some View {
        ZStack {
            LinearGradient(
                colors: [gradients[selectedGradientIndex].0, gradients[selectedGradientIndex].1],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )

            VStack(spacing: 12) {
                TextEditor(text: $textContent)
                    .scrollContentBackground(.hidden)
                    .foregroundColor(.white)
                    .font(.system(size: 20, weight: .bold))
                    .multilineTextAlignment(.center)
                    .frame(height: 200)

                // Gradient picker
                HStack(spacing: 8) {
                    ForEach(0..<gradients.count, id: \.self) { i in
                        Circle()
                            .fill(LinearGradient(colors: [gradients[i].0, gradients[i].1], startPoint: .topLeading, endPoint: .bottomTrailing))
                            .frame(width: 32, height: 32)
                            .overlay(
                                Circle().stroke(i == selectedGradientIndex ? Color.white : Color.clear, lineWidth: 2)
                            )
                            .onTapGesture { selectedGradientIndex = i }
                    }
                }
            }
            .padding(20)
        }
    }

    // MARK: - Image Preview

    private var imagePreview: some View {
        ZStack {
            Color.black

            if let data = selectedImageData, let uiImage = UIImage(data: data) {
                Image(uiImage: uiImage)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
            } else {
                VStack(spacing: 12) {
                    PhotosPicker(selection: $selectedPhoto, matching: .images) {
                        VStack(spacing: 8) {
                            Image(systemName: "photo.badge.plus")
                                .font(.system(size: 40))
                                .foregroundColor(.cyan)
                            Text("Choose Photo")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundColor(.cyan)
                        }
                    }
                }
            }
        }
        .onChange(of: selectedPhoto) { item in
            Task {
                if let data = try? await item?.loadTransferable(type: Data.self) {
                    selectedImageData = data
                }
            }
        }
    }

    // MARK: - Score Preview

    private var scorePreview: some View {
        let jacketURL: URL? = {
            guard let snap = prefilledSnapshot else { return nil }
            return JacketService.shared.resolveJacketURL(
                title: snap.songTitle, mode: snap.mode, level: snap.level,
                backgroundUrl: snap.jacketUrl
            )
        }()

        return GeometryReader { geo in
            ZStack {
                // Jacket background
                if let url = jacketURL {
                    AsyncImage(url: url) { phase in
                        if case .success(let img) = phase {
                            img.resizable().scaledToFill()
                                .frame(width: geo.size.width, height: geo.size.height)
                                .clipped()
                        } else {
                            Rectangle().fill(
                                LinearGradient(colors: [Color(hex: "#0f172a"), Color(hex: "#1e293b")], startPoint: .topLeading, endPoint: .bottomTrailing)
                            )
                        }
                    }
                } else {
                    Rectangle().fill(
                        LinearGradient(colors: [Color(hex: "#0f172a"), Color(hex: "#1e293b")], startPoint: .topLeading, endPoint: .bottomTrailing)
                    )
                }

                // Dark overlay
                LinearGradient(colors: [.black.opacity(0.25), .black.opacity(0.6), .black.opacity(0.9)], startPoint: .top, endPoint: .bottom)

                if let snap = prefilledSnapshot {
                    VStack(spacing: 10) {
                        Spacer()

                        Text(snap.songTitle ?? "")
                            .font(.system(size: 20, weight: .black))
                            .foregroundColor(.white)
                            .multilineTextAlignment(.center)

                        let isDouble = (snap.mode ?? "").lowercased().hasPrefix("d")
                        let prefix = isDouble ? "D" : "S"
                        Text("\(prefix)\(snap.level ?? 0)")
                            .font(.system(size: 12, weight: .black))
                            .foregroundColor(.white)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(
                                LinearGradient(
                                    colors: isDouble
                                        ? [Color(hex: "#4cf4aa"), Color(hex: "#0b5d48")]
                                        : [Color(hex: "#ff7a7a"), Color(hex: "#7a1730")],
                                    startPoint: .topLeading, endPoint: .bottomTrailing
                                )
                            )
                            .cornerRadius(4)

                        Text((snap.score ?? 0).formattedScore)
                            .font(.system(size: 44, weight: .black, design: .monospaced))
                            .foregroundColor(.white)

                        if let grade = snap.grade {
                            Text(grade)
                                .font(.system(size: 26, weight: .black))
                                .foregroundColor(gradeColor(grade))
                        }

                        Spacer().frame(height: 16)
                    }
                    .padding(20)
                }
            }
        }
        .frame(height: 380)
    }

    // MARK: - Post

    private func postStory() async {
        isPosting = true
        errorMessage = nil
        do {
            if let snap = prefilledSnapshot {
                let encoder = JSONEncoder()
                let data = try encoder.encode(snap)
                let json = String(data: data, encoding: .utf8) ?? "{}"
                _ = try await APIService.shared.createStorySnapshot(caption: caption, snapshotJson: json)
            } else if selectedMode == 0 {
                _ = try await APIService.shared.createStoryText(caption: "\(textContent)\n\(caption)")
            }
            onDismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
        isPosting = false
    }

    private func gradeColor(_ grade: String) -> Color {
        switch grade.uppercased() {
        case let g where g.contains("SSS"): return DojoTheme.piuGold
        case let g where g.contains("SS"): return .cyan
        case let g where g.contains("S"): return DojoTheme.piuGreen
        case let g where g.contains("A"): return .orange
        default: return .white
        }
    }
}
