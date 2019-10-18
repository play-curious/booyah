function preloadOne(url, done) {
	const xhr = new XMLHttpRequest();
	xhr.open('GET', url, true);
	xhr.responseType = 'blob';
	xhr.onprogress = event => {
		if (!event.lengthComputable) return false
		let item = this.getItemByUrl(url);
		item.completion = parseInt((event.loaded / event.total) * 100);
		item.downloaded = event.loaded;
		item.total = event.total;
		this.updateProgressBar(item);
	};
	xhr.onload = event => {
		let type = event.target.response.type;
		let blob = new Blob([event.target.response], { type: type });
		let blobUrl = URL.createObjectURL(blob);
		let responseURL = event.target.responseURL;
		let item = this.getItemByUrl(url);
		item.blobUrl = blobUrl;
		item.fileName = responseURL.substring(responseURL.lastIndexOf('/') + 1);
		item.type = type;
		item.size = blob.size;
		done(item);
	};
	xhr.send();
}

function updateProgressBar(item) {
	var sumCompletion = 0;
	var maxCompletion = this.status.length * 100;

	for (var itemStatus of this.status) {
		if (itemStatus.completion) {
			sumCompletion += itemStatus.completion;
		}
	}
	var totalCompletion = parseInt((sumCompletion / maxCompletion) * 100);

	if (!isNaN(totalCompletion)) {
		this.onprogress({
			progress: totalCompletion,
			item: item
		});
	}
}

function getItemByUrl(rawUrl) {
    for (var item of this.status) {
        if (item.url == rawUrl) return item
    }
}

function fetch(list) {	
	return new Promise((resolve, reject) => {
		this.loaded = list.length;
		for (let item of list) {
			this.status.push({ url: item });
			this.preloadOne(item, item => {
				this.onfetched(item);
				this.loaded--;
				if (this.loaded == 0) {
					this.oncomplete(this.status);
					resolve(this.status);
				}
			});
		}
	})
}

function Preload() {
	return {
		status: [],
		loaded: false,
		onprogress: () => {},
		oncomplete: () => {},
		onfetched: () => {},
		fetch,
		updateProgressBar,
		preloadOne,
		getItemByUrl
	}
}

export default Preload;
