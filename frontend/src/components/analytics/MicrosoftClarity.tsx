import Script from 'next/script';

const CLARITY_PROJECT_ID = 'yc1lzmq4k4';

/** Load Microsoft Clarity once site-wide without delaying page interaction. */
export function MicrosoftClarity() {
  return (
    <Script id="xroga-microsoft-clarity" strategy="afterInteractive">
      {`
        (function(c,l,a,r,i,t,y){
          c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
          t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
          y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
        })(window, document, "clarity", "script", "${CLARITY_PROJECT_ID}");
      `}
    </Script>
  );
}
