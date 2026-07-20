import { PlayCircle } from 'lucide-react'
import { YOUTUBE_TUTORIALS_URL } from '@/constants/homePromotions'

/**
 * Tarjeta de bienvenida con acceso a los tutoriales. Solo se muestra en escritorio y web:
 * en Android el home va sin ella para no gastar altura de pantalla.
 */
export function HomeWelcomeCard() {
  return (
    <div className="relative h-[220px] overflow-hidden rounded-[20px] shadow-sm">
      <img
        src="/home/inicio-hero.webp"
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover"
      />
      {/* Degradado solo sobre la mitad izquierda (donde va el texto): así la foto se ve
          y el título sigue legible. Antes cubría toda la tarjeta y la apagaba entera. */}
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950/85 via-slate-900/45 to-transparent" />

      <div className="relative flex h-full max-w-[65%] flex-col justify-center gap-3 p-6 lg:p-8">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-300 drop-shadow">
          Bienvenido a Tukifac Pro
        </span>
        <h2 className="text-2xl font-bold leading-tight text-white lg:text-3xl [text-shadow:0_2px_8px_rgb(2_6_23_/_0.75)]">
          ¿Qué vas a hacer hoy?
        </h2>
        <a
          href={YOUTUBE_TUTORIALS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-2 rounded-full bg-[#E4002B] px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-[#c40025]"
        >
          <PlayCircle size={18} aria-hidden />
          Ver tutoriales
        </a>
      </div>
    </div>
  )
}
