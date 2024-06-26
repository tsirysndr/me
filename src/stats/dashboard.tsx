/** @jsx h */
import { h } from "../../deps.ts";

export function dashboard() {
  return (
    <div>
      <a
        href="https://next.ossinsight.io/widgets/official/compose-user-dashboard-stats?user_id=15877106"
        target="_blank"
        style="display: block"
        align="center"
      >
        <picture>
          <img
            alt="Dashboard stats of @tsirysndr"
            src="https://next.ossinsight.io/widgets/official/compose-user-dashboard-stats/thumbnail.png?user_id=15877106&image_size=auto&color_scheme=light"
            style="width: 100%;margin-bottom: 20px;"
            height="auto"
          />
        </picture>
      </a>
      <div class="gh-trends">
        <a
          href="https://www.githubtrends.io/wrapped/tsirysndr"
          style="margin-right: 20px;"
        >
          <img src="https://api.githubtrends.io/user/svg/tsirysndr/langs?time_range=one_year&theme=ferns" />
        </a>
        <a href="https://www.githubtrends.io/wrapped/tsirysndr">
          <img src="https://api.githubtrends.io/user/svg/tsirysndr/repos?time_range=one_year&theme=ferns" />
        </a>
      </div>
      <a href="https://ossinsight.io/analyze/tsirysndr">
        <picture>
          <img
            src="https://github-readme-activity-graph.vercel.app/graph?username=tsirysndr&theme=react-light&hide_border=true&hide_title=false&area=true&custom_title=Total%20contribution%20graph%20in%20all%20repo"
            style="width: 100%; margin-bottom: 20px;"
            alt="activity graph"
          />
        </picture>
      </a>
    </div>
  );
}
