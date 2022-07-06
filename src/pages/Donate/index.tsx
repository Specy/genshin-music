import './Donate.css'
import paypalImg from 'assets/images/paypalme.png'
import buyMeACoffeeImg from 'assets/images/buymeacoffee.svg'
import kofiImg from 'assets/images/kofi.png'
import { SimpleMenu } from 'components/Layout/SimpleMenu'
import { Title } from 'components/Miscellaneous/Title'
export default function Donate() {
    return <div className='default-page'>
        <Title text="Donate" />

        <SimpleMenu/>
        <div className="donate-text">
            Each App I make takes months of learning and development. Added to that
            are also the costs of hosting. With a higher budget I can afford to not
            worry so much about how much I spend on the server, giving you the best
            possible experience.<br />
            I care about giving users all features without
            having to pay for it, neither having intrusive ads which can be annoying.
            For this same reason, there is no source of income except donations.
            <br /><br />
            I would be really thankful if you could consider donating in order to fund
            development and costs.
        </div>
        <div className="donation-wrapper">
            <a href="https://paypal.me/specyDev" target="_blank" className="paypal" rel="noreferrer">
                <img src={paypalImg} alt="paypalme" style={{ height: "3rem" }} loading='lazy'/>
            </a>
            <a href="https://ko-fi.com/specy" target="_blank" className="kofi" rel="noreferrer">
                <img src={kofiImg} alt="kofi" style={{ height: "2rem" }} loading='lazy'/>
            </a>
            <a href="https://www.buymeacoffee.com/specy" target="_blank" rel="noreferrer">
                <img src={buyMeACoffeeImg} alt="buymeacoffee" style={{ height: "3rem" }} loading='lazy'/>
            </a>
        </div>
    </div>
}