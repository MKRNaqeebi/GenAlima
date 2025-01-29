const GenInput = ({name: string}) => {
    return <>
        <label htmlFor="name">Name</label>
        <input type="text" id="name" name={name} />
    </>
}
export default GenInput;
