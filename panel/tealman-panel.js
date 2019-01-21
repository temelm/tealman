((gl, doc) => {
  'use strict'
  try {
    if (!gl || !doc) {
      return false
    }

    class Tab {
      /**
       * @param {string} selector
       */
      constructor (selector) {
        this.selector = selector
        this.container = doc.querySelector(selector)
        this.requestList = []
        this.requestListWrapper = doc.querySelector(`${selector} .request-list`)
        this.postDataHeading = doc.querySelector(`${selector} .right h1`)
        this.postDataWrapper = doc.querySelector(`${selector} .post-data`)
        this.init()
      }

      /**
       * Resets tab, i.e. captured requests, etc.
       */
      init () {
        this.requestList = []
        this.requestListWrapper.innerHTML = ''
        this.postDataHeading.innerHTML = ''
        this.postDataWrapper.innerHTML = ''
      }

      /**
       * Shows tab.
       */
      show () {
        this.container.classList.remove('hidden')
      }

      /**
       * Hides tab.
       */
      hide () {
        this.container.classList.add('hidden')
      }

      /**
       * @param {number} requestIndex
       * @todo Review
       * @todo Heading can be improved. For example, a combination of unique index + event category + event action.
       * @todo div.post-data is redrawn every time a request link is clicked. This is an inefficiency concern.
       */
      showPostData (requestIndex) {
        this.postDataHeading.innerHTML = `Request ${requestIndex + 1} post data`
        this.postDataWrapper.innerHTML = `${gl.Object.keys(this.requestList[requestIndex].data).reduce((acc, cur) => {
          let value = ''
          const tmp = this.requestList[requestIndex].data[cur]
          if (tmp === null) {
            value = 'null'
          } else if (typeof tmp === 'undefined') {
            value = 'undefined'
          } else if (/boolean|number|string/.test(typeof tmp)) {
            value = `${tmp}`
          } else if (typeof tmp === 'object') {
            value = gl.JSON.stringify(tmp)
          }
          return acc + `
            <div class="post-data-r">
              <div class="post-data-r-varname">${cur}</div>
              <div class="post-data-r-varvalue">${value}</div>
            </div>`
        }, '')}`
      }

      /**
       * @param {number} requestIndex
       * @return {boolean}
       * Checks if the request at given index is a page view.
       */
      isPageView (requestIndex) {
        let result = false
        const data = this.requestList[requestIndex].data
        if (data.t === 'pageview' || data.tealium_event === 'view') {
          result = true
        }
        return result
      }

      /**
       * Creates a unique link for displaying the newly captured request payload.
       */
      render () {
        this.requestList.forEach((cur, index) => {
          if (!this.container.querySelector(`.request a[data-index="${index}"]`)) {
            const newRequest = doc.createElement('div')
            const isPageView = this.isPageView(index)
            newRequest.setAttribute('class', `request${isPageView ? ' pageview' : ''}`)
            newRequest.innerHTML = `<a href="#" data-index="${index}">Request ${index + 1}</a>`
            newRequest.querySelector('a').addEventListener('click', (event) => {
              event.preventDefault()
              this.showPostData(gl.parseInt(event.target.dataset.index))
              this.container.querySelectorAll('.request a.active').forEach((cur) => cur.classList.remove('active'))
              event.target.classList.add('active')
            })
            this.requestListWrapper.appendChild(newRequest)
          }
        })
      }
    }

    const scope = {
      'gaTab': new Tab('.tab-ga'),
      'gaTabSwicther': doc.querySelector('.tab-switcher a[data-tab*="tab-ga"]'),
      'tealiumTab': new Tab('.tab-tealium'),
      'tealiumTabSwicther': doc.querySelector('.tab-switcher a[data-tab*="tab-tealium"]'),
      'clearRequests': doc.querySelector('.clear-requests')
    }

    /**
     * Handles switching to the Google Analytics tab.
     */
    scope.gaTabSwicther.addEventListener('click', (event) => {
      event.preventDefault()
      scope.tealiumTabSwicther.classList.remove('active')
      scope.tealiumTab.hide()
      scope.gaTabSwicther.classList.add('active')
      scope.gaTab.show()
    })

    /**
     * Handles switching to the Tealium tab.
     */
    scope.tealiumTabSwicther.addEventListener('click', (event) => {
      event.preventDefault()
      scope.gaTabSwicther.classList.remove('active')
      scope.gaTab.hide()
      scope.tealiumTabSwicther.classList.add('active')
      scope.tealiumTab.show()
    })

    /**
     * Handles clearing of all requests.
     */
    scope.clearRequests.addEventListener('click', (event) => {
      event.preventDefault()
      scope.gaTab.init()
      scope.tealiumTab.init()
    })

    /**
     * @param {object} req
     * @return {object}
     * Extracts Google Analytics payload from given network request.
     */
    scope.getGaPostData = (req) => {
      const gaPostData = {}
      const method = req.method.toLowerCase()
      if (method === 'get') {
        req.queryString.forEach((cur) => {
          gaPostData[`${gl.decodeURIComponent(cur.name)}`] = gl.decodeURIComponent(cur.value)
        })
      } else if (method === 'post') {
         const tmp = req.postData.text.split('&')
         tmp.forEach((cur) => {
           cur = cur.split('=')
           gaPostData[`${gl.decodeURIComponent(cur[0])}`] = `${gl.decodeURIComponent(cur[1])}`
         })
      }
      return gaPostData
    }
    
    /**
     * @param {string} text
     * @return {object}
     * Parses given Tealium payload (originally a stringified JSON object) into JSON.
     */
    scope.getTealiumPostData = (text) => {
      const begin = text.indexOf('{')
      const end = text.lastIndexOf('}') + 1
      const postData = gl.JSON.parse(text.substring(begin, end))
      return postData.data
    }

    /**
     * @param {object} req
     * Observes network activity to capture Google Analytics and Tealium requests.
     */
    scope.listen = (req) => {
      if (req && req.request) {
        const isTealiumRequest = /tealiumiq\.com(.*)\/i\.gif/.test(req.request.url) && req.request.postData
          && req.request.postData.text
        const isGaRequest = /google\-analytics\.com\/(r\/)?collect/.test(req.request.url) && req.request.queryString
        if (isTealiumRequest) {
          scope.tealiumTab.requestList.push({
            'data': scope.getTealiumPostData(req.request.postData.text)
          })
          scope.tealiumTab.render()
        } else if (isGaRequest) {
          scope.gaTab.requestList.push({
            'data': scope.getGaPostData(req.request)
          })
          scope.gaTab.render()
        }
      }
    }

    chrome.devtools.network.onRequestFinished.addListener(scope.listen)
    chrome.devtools.network.onNavigated.addListener(() => {
      scope.gaTab.init()
      scope.tealiumTab.init()
    })

    gl.tealman = scope

    return true
  } catch (exception) {
    if (gl && gl.console && typeof gl.console.error === 'function') {
      gl.console.error(exception)
    }
    return false
  }
})(window, window.document)
