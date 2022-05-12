function preloadOne<T>(url: string, done: (item: T) => void): void {
  const xhr = new XMLHttpRequest()
  xhr.open("GET", url, true)
  xhr.responseType = "blob"
  xhr.onprogress = (event) => {
    if (!event.lengthComputable) return false
    let item = this.getItemByUrl(url)
    item.completion = (event.loaded / event.total) * 100
    item.downloaded = event.loaded
    item.total = event.total
    this.updateProgressBar(item)
  }
  xhr.onload = (event: any) => {
    let type = event.target.response.type
    let blob = new Blob([event.target.response], { type: type })
    let blobUrl = URL.createObjectURL(blob)
    let responseURL = event.target.responseURL
    let item = this.getItemByUrl(url)
    item.blobUrl = blobUrl
    item.fileName = responseURL.substring(responseURL.lastIndexOf("/") + 1)
    item.type = type
    item.size = blob.size
    done(item)
  }
  xhr.send()
}

function updateProgressBar(item: any) {
  let sumCompletion = 0
  const maxCompletion = this.status.length * 100

  for (let itemStatus of this.status) {
    if (itemStatus.completion) {
      sumCompletion += itemStatus.completion
    }
  }
  const totalCompletion = (sumCompletion / maxCompletion) * 100

  if (!isNaN(totalCompletion)) {
    this.onprogress({
      progress: totalCompletion,
      item: item,
    })
  }
}

function getItemByUrl(rawUrl: string) {
  for (let item of this.status) {
    if (item.url == rawUrl) return item
  }
}

function fetch<T>(list: T[]) {
  return new Promise((resolve, reject) => {
    this.loaded = list.length
    for (let item of list) {
      this.status.push({ url: item })
      this.preloadOne(item, (item: T) => {
        this.onfetched(item)
        this.loaded--
        if (this.loaded == 0) {
          this.oncomplete(this.status)
          resolve(this.status)
        }
      })
    }
  })
}

function Preload() {
  return {
    status: [] as any[],
    loaded: false,
    onprogress: (e?: any) => {},
    oncomplete: (e?: any) => {},
    onfetched: (e?: any) => {},
    fetch,
    updateProgressBar,
    preloadOne,
    getItemByUrl,
  }
}

export default Preload
