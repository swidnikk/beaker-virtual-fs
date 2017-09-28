/* globals beaker */

const assert = require('assert')
const {FSContainer} = require('./base')
const {FSArchive} = require('./archive')

class FSVirtualFolder extends FSContainer {
  constructor () {
    super()
    this._children = []
  }

  get type () { return 'folder' }
  get isEmpty () { return this._children.length === 0 }
  get children () { return this._children }

  async readData () {
    this._children = await this.readChildren()
    this.sortChildren()
  }

  // should be overridden by subclass
  async readChildren () {
    return this._children
  }

  sortChildren () {
    this._children.sort((a, b) => a.name.localeCompare(b.name))
  }
}

class FSVirtualRoot extends FSVirtualFolder {
  get type () { return 'root folder' }
  get name () { return 'Root' }

  async readChildren () {
    // read user profile
    const profile = await beaker.profiles.getCurrentUserProfile()
    profile.isCurrentUser = true

    // read followed profiles
    const followedProfiles = await Promise.all((profile.followUrls || []).map(beaker.profiles.getUserProfile))
    const followedFolders = followedProfiles.map(p => new FSVirtualFolder_User(p))

    // generate children
    return [
      new FSVirtualFolder_User(profile),
      new FSVirtualFolder_Network(),
      ...followedFolders,
      new FSVirtualFolder_Trash()
    ]
  }

  sortChildren () {
    // dont sort
  }
}

class FSVirtualFolderWithTypes extends FSVirtualFolder {
  // helper to produce the child sets
  async createTypeChildren (sourceSet) {
    return [
      new FSVirtualFolder_TypeFilter(sourceSet, 'All', false),
      new FSVirtualFolder_TypeFilter(sourceSet, 'Applications', 'application'),
      new FSVirtualFolder_TypeFilter(sourceSet, 'Code modules', 'module'),
      new FSVirtualFolder_TypeFilter(sourceSet, 'Datasets', 'dataset'),
      new FSVirtualFolder_TypeFilter(sourceSet, 'Documents', 'documents'),
      new FSVirtualFolder_TypeFilter(sourceSet, 'Music', 'music'),
      new FSVirtualFolder_TypeFilter(sourceSet, 'Photos', 'photos'),
      new FSVirtualFolder_TypeFilter(sourceSet, 'User profiles', 'user-profile'),
      new FSVirtualFolder_TypeFilter(sourceSet, 'Videos', 'videos'),
      new FSVirtualFolder_TypeFilter(sourceSet, 'Websites', 'website')
    ]
  }
}

class FSVirtualFolder_TypeFilter extends FSVirtualFolder {
  constructor (sourceSet, label, type) {
    super()
    this._sourceSet = sourceSet
    this._label = label
    this._type = type
  }

  get name () { return this._label }

  async readChildren () {
    if (this._type) {
      return this._sourceSet.filter(child => (
        child._archiveInfo.type.includes(this._type)
      ))
    }
    // no filter
    return this._sourceSet
  }
}

class FSVirtualFolder_User extends FSVirtualFolderWithTypes {
  constructor (profile) {
    super()
    this._profile = profile
  }

  get name () { return this._profile.name || 'Anonymous' }

  async readChildren () {
    // read source set of archives
    var archives
    if (this._profile.isCurrentUser) {
      archives = await beaker.archives.list({isSaved: true, isOwner: true})
    } else {
      // fetch their published archives
      archives = await beaker.archives.listPublished({author: this._profile._origin})
      // remove their profile archive if its in there (we want the direct source)
      archives = archives.filter(a => a.url !== this._profile._origin)
      // now add their profile archive to the front
      let profileArchive = new DatArchive(this._profile._origin)
      let profileArchiveInfo = await profileArchive.getInfo()
      archives.unshift(profileArchiveInfo)
    }
    const sourceSet = archives.map(a => new FSArchive(a))
    return this.createTypeChildren(sourceSet)
  }
}

class FSVirtualFolder_Network extends FSVirtualFolderWithTypes {
  get name () { return 'Network' }

  async readChildren () {
    const archives = await beaker.archives.list({isSaved: true, isOwner: false})
    const sourceSet = archives.map(a => new FSArchive(a))
    return this.createTypeChildren(sourceSet)
  }

  // special helper
  // this folder has archives added arbitrarily on user access
  // so we need this method to add the archive
  addArchive (archiveInfo) {
    // all children share a sourceSet
    // so just add to one of them
    const alreadyExists = !!this._children[0]._sourceSet.find(item => item._archiveInfo.url === archiveInfo.url)
    if (!alreadyExists) {
      const archive = new FSArchive(archiveInfo)
      this._children[0]._sourceSet.push(archive)
    }
  }

  sortChildren () {
    // dont sort
  }
}

class FSVirtualFolder_Trash extends FSVirtualFolderWithTypes {
  get name () { return 'Trash' }

  async readChildren () {
    const archives = await beaker.archives.list({isSaved: false})
    const sourceSet = archives.map(a => new FSArchive(a))
    return this.createTypeChildren(sourceSet)
  }
}

module.exports = {
  FSVirtualRoot,
  FSVirtualFolder,
  FSVirtualFolderWithTypes,
  FSVirtualFolder_TypeFilter,
  FSVirtualFolder_User,
  FSVirtualFolder_Network,
  FSVirtualFolder_Trash
}
