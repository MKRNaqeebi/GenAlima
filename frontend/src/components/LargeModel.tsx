const LargeModel = () => {
  /*
    name: str
    description: str
    rank: int
    provider: str
    organization: str
    active: bool
  */
  return (
    <div>
      {/* create form to create LargeModel entry */}
      <label htmlFor="name">Name</label>
      <input type="text" id="name" name="name" />
      <label htmlFor="description">Description</label>
      <input type="text" id="description" name="description" />
      <label htmlFor="rank">Rank</label>
      <input type="number" id="rank" name="rank" />
      <label htmlFor="provider">Provider</label>
      <input type="text" id="provider" name="provider" />
      <label htmlFor="organization">Organization</label>
      <input type="text" id="organization" name="organization" />
      <label htmlFor="active">Active</label>
      <input type="checkbox" id="active" name="active" />
    </div>
  )
}

export default LargeModel;
