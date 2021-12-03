import './Support.css'
import paypalImg from 'assets/images/paypalme.png'
import buyMeACoffeeImg from 'assets/images/buymeacoffee.svg'
import kofiImg from 'assets/images/kofi.png'
import { SimpleMenu } from 'components/SimpleMenu'
export default function Support(props) {
    return <div className='support-page'>
        <SimpleMenu functions={{changePage: props.changePage}}/>
        <div className="support-text">
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
            <a href="https://www.buymeacoffee.com/specy" target="_blank" rel="noreferrer">
                <img src={buyMeACoffeeImg} alt="buymeacoffee" style={{ height: "4rem" }} />
            </a>
            <a href="https://paypal.me/specyDev" target="_blank" className="paypal" rel="noreferrer">
                <img src={paypalImg} alt="paypalme" style={{ height: "4rem" }} />
            </a>
            <a href="https://ko-fi.com/specy" target="_blank" className="kofi" rel="noreferrer">
                <img src={kofiImg} alt="kofi" style={{ height: "3rem" }} />
            </a>
        </div>
    </div>
}