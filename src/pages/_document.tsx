import { BASE_PATH } from '$config';
import { Html, Head, Main, NextScript } from 'next/document';
import Script from 'next/script';

export default function Document() {
	return (
		<Html lang='en'>
			<Head>
				<meta name="viewport"
					content="user-scalable=no, width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0" />
				<meta name="theme-color" content="#63aea7" />
				<link rel="icon" href={BASE_PATH + "/favicon.ico"} />
				<link rel="apple-touch-icon" href={BASE_PATH + "/logo192.png"} />
				<link rel="manifest" href={BASE_PATH + "/manifest.json"} />
				{process.env.NEXT_PUBLIC_APP_NAME === "Sky"
					? <>
						<meta name="description" content="Sky music nightly, a website to play, practice and compose songs" />
						<title>Sky Music Nightly</title>
					</>
					: <>
						<meta name="description" content="Genshin music, a website to play, practice and compose songs" />
						<title>Genshin Music Nightly</title>
					</>
				}
			</Head>
			<body>
				<Main />
				<NextScript />
			</body>
		</Html>
	);
}