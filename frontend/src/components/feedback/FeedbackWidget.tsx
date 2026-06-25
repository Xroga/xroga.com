'use client';

import { useEffect } from 'react';
import { MessageCircle } from 'lucide-react';

export function FeedbackWidget() {
  useEffect(() => {
    const projectId = process.env.NEXT_PUBLIC_FEEDBACK_PROJECT_ID;
    if (!projectId || typeof window === 'undefined') return;

    const script = document.createElement('script');
    script.src = 'https://cdn.feedback.js.org/widget.js';
    script.async = true;
    script.dataset.projectId = projectId;
    document.body.appendChild(script);

    return () => {
      script.remove();
    };
  }, []);

  function openFeedback() {
    const projectId = process.env.NEXT_PUBLIC_FEEDBACK_PROJECT_ID;
    if (projectId && typeof window !== 'undefined') {
      window.open(`https://feedback.js.org/p/${projectId}`, '_blank');
      return;
    }
    window.open('mailto:hello@xroga.com?subject=Feedback', '_blank');
  }

  return (
    <button
      type="button"
      onClick={openFeedback}
      className="fixed bottom-20 md:bottom-6 right-4 z-40 w-12 h-12 rounded-full bg-violet-600 hover:bg-violet-500 shadow-lg shadow-violet-500/30 flex items-center justify-center transition-all hover:scale-110"
      aria-label="Send feedback"
    >
      <MessageCircle className="w-5 h-5" />
    </button>
  );
}
