import {MouseEvent, useEffect, useState} from "react";
import {APP_NAME, BASE_PATH} from "$config";
import {Card} from "$cmp/shared/layout/Card";
import s from './promotionCard.module.scss'
import {Column} from "$cmp/shared/layout/Column";
import {Row} from "$cmp/shared/layout/Row";
import {Header} from "$cmp/shared/header/Header";
import Link from "next/link";
import {AppButton} from "$cmp/shared/Inputs/AppButton";
import {FaTimes} from "react-icons/fa";
import {useTranslation} from "react-i18next";
import {Stylable} from "$lib/utils/UtilTypes";

const promotion = {
    id: '1',
    title: `Help fund ${APP_NAME} Music Nightly!`,
    description: `Donate to help us with the development of ${APP_NAME} Music Nightly!`,
    image: BASE_PATH + '/manifestData/main.webp',
    url: `/donate`
}

interface PromotionCardProps extends Stylable{
    onClick?: (e: MouseEvent<HTMLAnchorElement>) => void
    alwaysVisible?: boolean
}

export function PromotionCard({onClick, alwaysVisible, style, className}: PromotionCardProps) {
    const {t} = useTranslation('home')
    const [visible, setVisible] = useState(false)
    useEffect(() => {
        const viewedPromotionsBefore = Boolean(localStorage.getItem(`${APP_NAME}_viewed_promotions_before`))
        const promotionId = localStorage.getItem(`${APP_NAME}_viewed_promotion`) ?? ''
        if (promotionId !== promotion.id && viewedPromotionsBefore) {
            setVisible(true)
        }
        localStorage.setItem(`${APP_NAME}_viewed_promotions_before`, 'true')
    }, []);

    function close() {
        setVisible(false)
        localStorage.setItem(`${APP_NAME}_viewed_promotion`, promotion.id)
    }

    if (!visible && !alwaysVisible) return null
    return <Card
        radius={'0.4rem'}
        style={style}
        className={`${className} ${s['promotion-card']}`}
    >
        <img
            src={promotion.image}
            alt={promotion.title}
            className={`${s['promotion-image']}`}
        />

        <Row style={{zIndex: 2}} justify={'between'}>
            <Column style={{padding: '0.8rem 1rem'}} gap={'0.4rem'}>
                <Header type={'h3'}>{promotion.title}</Header>
                <div style={{maxWidth: '40ch', opacity: '0.9'}}>
                    {promotion.description}
                </div>
            </Column>
            <Column justify={'end'} padding={'0.5rem'} className={`${s['promotion-right-side']}`}>
                {!alwaysVisible && <button
                    className={`${s['promotion-close']}`}
                    onClick={close}
                    title={t('close_promotion')}
                >
                    <FaTimes/>
                </button>}
                <Link
                    href={promotion.url}
                    onClick={(e) => {
                        onClick?.(e)
                    }}
                >
                    <AppButton
                        cssVar={'accent'}
                    >
                        {t('find_out_more')}
                    </AppButton>
                </Link>
            </Column>
        </Row>
    </Card>
}