import SwiftUI

struct NoteComposerView: View {
    let existingNote: HighlightNote?
    let onSave: (String) -> Void
    let onClear: () -> Void

    @Environment(\.dismiss) var dismiss
    @State private var draft = ""
    @State private var isSaving = false
    private let maxLength = 120

    var body: some View {
        NavigationStack {
            ZStack {
                DojoTheme.piuBg.ignoresSafeArea()

                VStack(alignment: .leading, spacing: 16) {
                    // Header
                    VStack(alignment: .leading, spacing: 4) {
                        Text("YOUR NOTE")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.cyan.opacity(0.8))
                            .tracking(1.5)

                        Text("Set your status bubble")
                            .font(.system(size: 24, weight: .black))
                            .foregroundColor(.white)
                    }

                    // Text input
                    TextEditor(text: $draft)
                        .scrollContentBackground(.hidden)
                        .foregroundColor(.white)
                        .font(.system(size: 16))
                        .frame(height: 100)
                        .padding(12)
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .fill(Color.white.opacity(0.06))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 12)
                                        .stroke(Color.white.opacity(0.1), lineWidth: 1)
                                )
                        )
                        .onChange(of: draft) { newValue in
                            if newValue.count > maxLength {
                                draft = String(newValue.prefix(maxLength))
                            }
                        }

                    // Footer info
                    HStack {
                        Text("Notes last 24 hours and start a fresh reply thread when changed.")
                            .font(.system(size: 11))
                            .foregroundColor(DojoTheme.textMuted)

                        Spacer()

                        Text("\(draft.trimmingCharacters(in: .whitespacesAndNewlines).count)/\(maxLength)")
                            .font(.system(size: 11))
                            .foregroundColor(DojoTheme.textMuted)
                    }

                    Spacer()

                    // Action buttons
                    HStack {
                        Button {
                            onClear()
                            dismiss()
                        } label: {
                            Text("Clear note")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundColor(.gray)
                                .padding(.horizontal, 20)
                                .padding(.vertical, 10)
                                .background(
                                    Capsule()
                                        .fill(Color.white.opacity(0.06))
                                        .overlay(Capsule().stroke(Color.white.opacity(0.1), lineWidth: 1))
                                )
                        }

                        Spacer()

                        Button {
                            isSaving = true
                            onSave(draft.trimmingCharacters(in: .whitespacesAndNewlines))
                            dismiss()
                        } label: {
                            Text(isSaving ? "Saving..." : "Save note")
                                .font(.system(size: 14, weight: .black))
                                .foregroundColor(.white)
                                .padding(.horizontal, 20)
                                .padding(.vertical, 10)
                                .background(Capsule().fill(Color.cyan))
                        }
                        .disabled(isSaving || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        .opacity(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.6 : 1)
                    }
                }
                .padding(20)
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button { dismiss() } label: {
                        Text("Close")
                            .font(.system(size: 14))
                            .foregroundColor(.gray)
                    }
                }
            }
            .onAppear {
                draft = existingNote?.text ?? ""
            }
        }
    }
}
