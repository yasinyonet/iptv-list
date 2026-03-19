const cheerio = require('cheerio')
const axios = require('axios')
const dayjs = require('dayjs')
const utc = require('dayjs/plugin/utc')

dayjs.extend(utc)

const baseUrl = 'https://tvplus.com.tr/canli-tv/yayin-akisi'

module.exports = {
  site: 'tvplus.com.tr',
  days: 2,

  async url({ channel }) {

    if (!module.exports.buildId) {
      module.exports.buildId = await module.exports.fetchBuildId()
    }

    const channelId = channel.site_id.replace('/', '--')

    return `https://tvplus.com.tr/_next/data/${module.exports.buildId}/tr/canli-tv/yayin-akisi/${channelId}.json?title=${channelId}`
  },

  parser({ content }) {

    const programs = []

    if (!content) return programs

    let data

    try {
      data = JSON.parse(content)
    } catch {
      return programs
    }

    const list = data?.pageProps?.allPlaybillList

    if (!Array.isArray(list)) return programs

    list.forEach(group => {

      group.forEach(schedule => {

        programs.push({
          title: schedule.name,
          description: schedule.introduce,
          category: schedule.genres,
          image: schedule.picture,
          start: dayjs.utc(schedule.starttime),
          stop: dayjs.utc(schedule.endtime)
        })

      })

    })

    return programs
  },

  async channels() {

    const channels = []

    try {

      const html = await axios.get(baseUrl).then(r => r.data)

      const $ = cheerio.load(html)

      $('a[href*="/canli-tv/yayin-akisi/"]').each((i, el) => {

        const href = $(el).attr('href')

        const match = href.match(/yayin-akisi\/(.+)--(\d+)/)

        if (!match) return

        const slug = match[1]
        const id = match[2]

        const name = $(el).text().trim()

        const logo = $(el).find('img').attr('src')

        channels.push({
          lang: 'tr',
          name: name,
          site_id: `${slug}/${id}`,
          xmltv_id: `${name.replace(/\s+/g,'')}.tr`,
          logo: logo
        })

      })

    } catch (err) {

      console.error('Channel parse error:', err.message)

    }

    return channels
  },

  async fetchBuildId() {

    try {

      const html = await axios.get(baseUrl).then(r => r.data)

      const $ = cheerio.load(html)

      const nextData = $('#__NEXT_DATA__').html()

      if (!nextData) return null

      const json = JSON.parse(nextData)

      return json.buildId

    } catch {

      return null

    }

  }
}