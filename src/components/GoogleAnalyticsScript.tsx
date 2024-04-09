import Script from "next/script";


export function GoogleAnalyticsScript() {
    return process.env.NEXT_PUBLIC_APP_NAME === "Sky"
        ? <>
            <Script async src="https://www.googletagmanager.com/gtag/js?id=G-YEHPSLXGYT"/>
            <Script id="google-analytics">
                {`
							window.dataLayer = window.dataLayer || [];
								function gtag() {dataLayer.push(arguments); }
								gtag('js', new Date());
		
								gtag('config', 'G-YEHPSLXGYT', {
									send_page_view: false,
								anonymize_ip: true
							});
						`}
            </Script>
        </>
        : <>
            <Script async src="https://www.googletagmanager.com/gtag/js?id=G-T3TJDT2NFS"/>
            <Script id="google-analytics">
                {`
							window.dataLayer = window.dataLayer || [];
								function gtag() { dataLayer.push(arguments); }
								gtag('js', new Date());
						
								gtag('config', 'G-BSC3PC58G4', {
									send_page_view: false,
									anonymize_ip: true
							});
						`}
            </Script>
        </>

}