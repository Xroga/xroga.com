import { XrogaChipLoader } from '@/components/ui/XrogaChipLoader';

export default function Loading() {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[var(--background)]">
      <XrogaChipLoader className="w-[min(88vw,20rem)] sm:w-[24rem] md:w-[32rem] lg:w-[36rem]" />
    </div>
  );
}
