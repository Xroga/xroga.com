'use client';

interface UploadAnimButtonProps {
  active: boolean;
  onClick?: () => void;
  className?: string;
}

export function UploadAnimButton({ active, onClick, className }: UploadAnimButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`xv-upload-anim shrink-0 ${active ? 'xv-upload-anim--active' : ''} ${className ?? ''}`}
      title="Upload files"
      aria-busy={active}
      aria-label="Upload"
    >
      <span className="xv-upload-app">
        <span className="xv-upload-arrow" />
        <span className="xv-upload-success">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" aria-hidden>
            <path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z" />
          </svg>
        </span>
      </span>
    </button>
  );
}
