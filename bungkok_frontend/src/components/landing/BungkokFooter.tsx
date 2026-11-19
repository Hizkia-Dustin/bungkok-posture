import MeadowRiseFooter, {
  type MeadowColumn,
  type MeadowPaletteOverrides,
} from "../ui/meadow-rise-footer";
import "../../styles/footer.css";

const columns: MeadowColumn[] = [
  {
    title: "Kenali BUNGKOK",
    links: [
      { label: "Tentang BUNGKOK", href: "/#about" },
      { label: "Cara kerja", href: "/#cara-kerja" },
      { label: "Fitur utama", href: "/#fitur" },
    ],
  },
  {
    title: "Bangun kebiasaan",
    links: [
      { label: "Mulai latihan", href: "/app/dashboard" },
      { label: "Perkembangan", href: "/app/perkembangan" },
      { label: "Tantangan", href: "/app/tantangan" },
      { label: "Reward & badge", href: "/app/reward" },
    ],
  },
  {
    title: "Akun & bantuan",
    links: [
      { label: "Masuk", href: "/login" },
      { label: "Buat akun", href: "/register" },
      { label: "Pusat bantuan", href: "/app/bantuan" },
    ],
  },
];

const palette: MeadowPaletteOverrides = {
  sky: ["#f8fbff", "#e5f2fc"],
  haze: "#d7eaf6",
  glow: "#fff1f7",
  hills: [
    ["#c3dfeF", "#a2c7df"],
    ["#a8cfe6", "#7ca9c5"],
    ["#86b8d6", "#5a8eae"],
    ["#6399ba", "#3e7193"],
    ["#467c9d", "#2b526f"],
    ["#2d5876", "#1b354b"],
  ],
  ground: "#172f43",
  ink: "#203d55",
  sub: "#405d73",
  pill: "#ff70b5",
  pillInk: "#142b3e",
  text: "#f5faff",
  muted: "#bbcfdd",
  line: "rgba(197, 229, 251, 0.2)",
};

export default function BungkokFooter() {
  return (
    <MeadowRiseFooter
      className="bungkok-footer"
      name="BUNGKOK"
      brandHref="/"
      logo={<></>}
      heading={"Duduk lebih sadar,\n*mulai dari hari ini.*"}
      subheading="Sempatkan jeda. Temukan posisi yang nyaman. Bangun kebiasaan duduk yang lebih sadar, sedikit demi sedikit."
      cta={{ label: "Mulai bersama BUNGKOK", href: "/register" }}
      tagline="Teman untuk duduk lebih sadar. Pantau postur, ingatkan dengan lembut, dan lihat perkembangan kebiasaanmu."
      newsletter={false}
      columns={columns}
      socials={[]}
      legal={[{ label: "Kembali ke atas ↑", href: "/#top" }]}
      copyright={`© ${new Date().getFullYear()} BUNGKOK. Mulai dari kebiasaan kecil.`}
      preset="meadow"
      palette={palette}
      fontFamily={'"Instrument Sans", system-ui, sans-serif'}
      serifFamily={'"Pinyon Script", Georgia, serif'}
      height="940px"
      heroHeight="560px"
      maxWidth="1280px"
      botanicals={false}
      mist={0.35}
      drift={0.5}
      scrollReveal
    />
  );
}
