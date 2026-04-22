import React from "react";

interface ImagePreviewProps {
  previewImage: string | null;
  setPreviewImage: (url: string | null) => void;
}

const ImagePreview: React.FC<ImagePreviewProps> = ({
  previewImage,
  setPreviewImage,
}) => {
  if (!previewImage) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={() => setPreviewImage(null)}
    >
      <button
        className="absolute top-6 right-6 text-white hover:text-gray-300 transition-colors p-2 bg-white/10 rounded-full"
        onClick={() => setPreviewImage(null)}
      >
        <svg
          className="w-8 h-8"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>

      <img
        src={previewImage}
        alt="Preview"
        className="max-w-full max-h-full rounded-lg shadow-2xl animate-in zoom-in-95 duration-300 object-contain"
        onClick={(e) => e.stopPropagation()}
      />

      <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/60 text-sm font-medium tracking-wide bg-black/20 px-4 py-2 rounded-full backdrop-blur-md">
        Secure Encrypted Preview
      </p>
    </div>
  );
};

export default ImagePreview;
