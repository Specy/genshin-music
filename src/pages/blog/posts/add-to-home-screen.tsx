import {BlogMetadata} from "$cmp/pages/blog/types";
import {BaseBlogPost, SpecyAuthor} from "$cmp/pages/blog/BaseBlogPost";
import {Header} from "$cmp/shared/header/Header";
import {BlogP} from "$cmp/pages/blog/BlogUl";
import {BASE_PATH} from "$config";
import {ExpandableContainer} from "$cmp/shared/expandableContainer/ExpandableContainer";
import {useObservableObject} from "$lib/Hooks/useObservable";
import {pwaStore} from "$stores/PwaStore";
import {AppButton} from "$cmp/shared/Inputs/AppButton";
import {FaDownload} from "react-icons/fa";
import {useTranslation} from "react-i18next";
import {Column} from "$cmp/shared/layout/Column";
import {Row} from "$cmp/shared/layout/Row";
import {BlogImage} from "$cmp/pages/blog/BlogImage";


export const _add_to_home_screen: BlogMetadata = {
    title: "⬇️ Add the app to the home screen",
    tags: ["Guide"],
    relativeUrl: "add-to-home-screen",
    image: BASE_PATH + '/manifestData/main.webp',
    description: "How to add the website to the home screen on your phone or computer.",
    createdAt: new Date("2024/05/22"),
    author: SpecyAuthor,

}


export default function BlogPage() {
    const {t} = useTranslation('home')
    const {installEvent} = useObservableObject(pwaStore.state)
    return <BaseBlogPost metadata={_add_to_home_screen}>

        <div>
            <BlogP>
                Adding the app to the home screen will make it behave more like an actual native app. It will go full
                screen and
                create an icon to quickly access the app. In certain browsers (like chrome or chromium based) it will
                also allow more
                features, like the ability to open the files created by the app.
            </BlogP>
            {installEvent && <BlogP>
                Your browser allows for the app to be quickly installed, just press this button and then press the "install"
                button that will pop up in your browser.
                <AppButton onClick={pwaStore.install} cssVar={'accent'} style={{marginLeft: '1rem'}}>
                    <FaDownload/> {t('install_app')}
                </AppButton>
            </BlogP>}
            <Header type={'h2'} margin={'1rem 0'}>
                How to install the app in different devices
            </Header>

            <Column gap={'0.8rem'}>
                <ExpandableContainer headerContent={<Header type={'h2'}>iPhone / iPad</Header>}>
                    <Row gap={'0.5rem'}>
                        <BlogImage
                            src={BASE_PATH + '/assets/blog/add-to-home-screen/ios1.webp'}
                            alt={'First step to download the app'}
                            width={'50%'}
                        />
                        <BlogImage
                            src={BASE_PATH + '/assets/blog/add-to-home-screen/ios2.webp'}
                            alt={'Second step to download the app'}
                            width={'50%'}
                        />
                    </Row>
                </ExpandableContainer>
                <ExpandableContainer headerContent={<Header type={'h2'}>PC / Mac</Header>}>
                    <BlogP>
                        If you are on Mac, i suggest using the app with chrome or chromium based browsers instead of safari.
                    </BlogP>
                    <BlogImage
                        src={BASE_PATH + '/assets/blog/add-to-home-screen/desktop.webp'}
                        alt={'Second step to download the app'}
                        width={'100%'}
                    />
                </ExpandableContainer>
                <ExpandableContainer headerContent={<Header type={'h2'}>Android</Header>}>
                    <Row justify={'center'} flex1>
                        <BlogImage
                            src={BASE_PATH + '/assets/blog/add-to-home-screen/android.webp'}
                            alt={'Second step to download the app'}
                            width={'50%'}
                        />
                    </Row>
                </ExpandableContainer>
            </Column>
        </div>
    </BaseBlogPost>
}