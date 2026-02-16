import SwiftUI
import PhotosUI

struct PostComposerView: View {
    @EnvironmentObject var auth: AuthManager
    @Environment(\.dismiss) var dismiss
    @State private var content = ""
    @State private var youtubeUrl = ""
    @State private var commentsEnabled = true
    @State private var selectedPhotos: [PhotosPickerItem] = []
    @State private var imageData: [Data] = []
    @State private var saving = false
    @State private var errorMessage: String?

    var body: some View {
        ZStack {
            DojoTheme.piuBg.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    // Author
                    HStack(spacing: 10) {
                        AvatarView(auth.currentUser?.avatar, name: auth.currentUser?.username ?? "?", size: 36)
                        Text(auth.currentUser?.username ?? "")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(.white)
                    }

                    // Text input
                    TextEditor(text: $content)
                        .frame(minHeight: 120)
                        .padding(10)
                        .background(DojoTheme.piuCard)
                        .foregroundColor(.white)
                        .cornerRadius(10)
                        .scrollContentBackground(.hidden)
                        .overlay(alignment: .topLeading) {
                            if content.isEmpty {
                                Text("What's on your mind?")
                                    .foregroundColor(DojoTheme.textMuted)
                                    .padding(.horizontal, 14)
                                    .padding(.vertical, 18)
                                    .allowsHitTesting(false)
                            }
                        }

                    // Image picker
                    PhotosPicker(
                        selection: $selectedPhotos,
                        maxSelectionCount: 9,
                        matching: .images
                    ) {
                        HStack(spacing: 6) {
                            Image(systemName: "photo.on.rectangle.angled")
                            Text("Add Photos (\(imageData.count)/9)")
                                .font(.system(size: 13))
                        }
                        .foregroundColor(DojoTheme.piuBlue)
                        .padding(10)
                        .background(DojoTheme.piuCard)
                        .cornerRadius(8)
                    }
                    .onChange(of: selectedPhotos) { _ in
                        Task { await loadImages() }
                    }

                    // Image preview
                    if !imageData.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(Array(imageData.enumerated()), id: \.offset) { index, data in
                                    if let uiImage = UIImage(data: data) {
                                        Image(uiImage: uiImage)
                                            .resizable()
                                            .aspectRatio(contentMode: .fill)
                                            .frame(width: 80, height: 80)
                                            .clipShape(RoundedRectangle(cornerRadius: 8))
                                            .overlay(alignment: .topTrailing) {
                                                Button {
                                                    imageData.remove(at: index)
                                                } label: {
                                                    Image(systemName: "xmark.circle.fill")
                                                        .foregroundColor(.white)
                                                        .background(Circle().fill(.black.opacity(0.5)))
                                                }
                                                .offset(x: 4, y: -4)
                                            }
                                    }
                                }
                            }
                        }
                    }

                    // YouTube URL
                    VStack(alignment: .leading, spacing: 4) {
                        Text("YouTube URL (optional)")
                            .font(.system(size: 12))
                            .foregroundColor(DojoTheme.textMuted)
                        TextField("https://youtube.com/...", text: $youtubeUrl)
                            .textFieldStyle(DojoTextFieldStyle())
                            .keyboardType(.URL)
                            .autocapitalization(.none)
                    }

                    // Comments toggle
                    Toggle("Allow Comments", isOn: $commentsEnabled)
                        .tint(DojoTheme.piuAccent)
                        .foregroundColor(.white)
                        .padding(12)
                        .background(DojoTheme.piuCard)
                        .cornerRadius(8)

                    // Error
                    if let err = errorMessage {
                        Text(err)
                            .font(.system(size: 12))
                            .foregroundColor(.red)
                    }

                    // Post button
                    Button {
                        Task { await createPost() }
                    } label: {
                        HStack {
                            if saving {
                                ProgressView().tint(.white).scaleEffect(0.8)
                            }
                            Text("Post")
                                .font(.system(size: 16, weight: .bold))
                        }
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(content.isEmpty && imageData.isEmpty ? DojoTheme.textMuted : DojoTheme.piuAccent)
                        .cornerRadius(12)
                    }
                    .disabled(saving || (content.isEmpty && imageData.isEmpty))
                }
                .padding()
            }
        }
        .navigationTitle("New Post")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func loadImages() async {
        var newData: [Data] = []
        for item in selectedPhotos {
            if let data = try? await item.loadTransferable(type: Data.self) {
                // Compress to ~100KB
                if let uiImage = UIImage(data: data),
                   let compressed = uiImage.jpegData(compressionQuality: 0.5) {
                    newData.append(compressed)
                }
            }
        }
        imageData = newData
    }

    private func createPost() async {
        saving = true
        errorMessage = nil
        do {
            var fields: [String: String] = [
                "content": content,
                "comments_disabled": commentsEnabled ? "0" : "1"
            ]
            if !youtubeUrl.isEmpty { fields["youtube_url"] = youtubeUrl }

            let images = imageData.enumerated().map { (index, data) in
                ("image\(index).jpg", data)
            }

            let _: Post = try await APIService.shared.uploadMultipart(
                "/social/posts",
                fields: fields,
                images: images
            )
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
        saving = false
    }
}
