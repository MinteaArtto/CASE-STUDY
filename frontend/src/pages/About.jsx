import { GraduationCap, Users } from "lucide-react";

export default function About() {
  const members = [
    {
      name: "Jester Calara",
      role: "Documentation",
    },
    {
      name: "Radcliff Flores",
      role: "Frontend Developer",
    },
    {
      name: "Charmaine Guevarra",
      role: "Backend Developer",
    },
  ];

  return (
    <main className="min-h-screen bg-cream-light text-ink">
      {/* ======================================================
          HERO
          ====================================================== */}

      <section className="relative overflow-hidden">
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[520px] h-[520px] rounded-full bg-teal/5 blur-3xl pointer-events-none" />

        <div className="relative max-w-5xl mx-auto px-6 pt-20 pb-14 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal">
            About Us
          </p>

          <h1 className="mt-4 font-display text-4xl sm:text-5xl lg:text-6xl font-semibold leading-tight max-w-4xl mx-auto">
            MaMaV is a student-developed predictive analytics project.
          </h1>

          <p className="mt-6 max-w-3xl mx-auto text-lg leading-8 text-ink/70">
            MaMaV was created as part of our academic learning and research
            project in Information Technology. It allows us to apply what we
            have learned in web development, data handling, machine learning,
            and system design in one working application.
          </p>
        </div>
      </section>

      {/* ======================================================
          PROJECT
          ====================================================== */}

      <section className="max-w-5xl mx-auto px-6 pb-16">
        <div className="rounded-[2rem] border border-ink/10 bg-white/70 p-8 sm:p-10 shadow-sm">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-teal/10 text-teal flex items-center justify-center">
            <GraduationCap className="w-6 h-6" />
          </div>

          <h2 className="mt-5 text-center font-display text-2xl sm:text-3xl font-semibold">
            Our Project
          </h2>

          <p className="mt-4 max-w-3xl mx-auto text-center text-ink/65 leading-7">
            Through MaMaV, we developed a system that combines market price
            forecasting and spoilage classification for selected perishable
            goods. The project serves as a learning experience for our team and
            demonstrates how predictive analytics can be integrated into a
            web-based system.
          </p>
        </div>
      </section>

      {/* ======================================================
          TEAM
          ====================================================== */}

      <section className="max-w-5xl mx-auto px-6 pb-20">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-mint/20 text-teal flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>

          <h2 className="mt-5 font-display text-3xl font-semibold">
            Meet the Team
          </h2>

          <p className="mt-3 text-ink/60">
            The student researchers behind MaMaV.
          </p>
        </div>

        <div className="mt-10 grid md:grid-cols-3 gap-5">
          {members.map((member) => (
            <article
              key={member.name}
              className="
                rounded-3xl
                border
                border-ink/10
                bg-white/70
                px-6
                py-8
                text-center
                shadow-sm
                transition
                duration-200
                hover:-translate-y-1
                hover:shadow-md
              "
            >
              <div
                className="
                  w-14
                  h-14
                  mx-auto
                  rounded-full
                  bg-linear-to-br
                  from-teal
                  to-mint
                  flex
                  items-center
                  justify-center
                  text-white
                  font-display
                  font-semibold
                  text-lg
                "
              >
                {member.name
                  .split(" ")
                  .map((name) => name[0])
                  .join("")}
              </div>

              <h3 className="mt-5 font-display text-lg font-semibold">
                {member.name}
              </h3>

              <p className="mt-1 text-sm text-ink/55">{member.role}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
